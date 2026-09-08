import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { parse } from 'csv-parse/sync';

const WINDOW = 15 * 60 * 1000;
const isLoopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
const normalize = value => String(value ?? '').trim().replace(/^0+(?=\d)/, '').padStart(2, '0');
const validPin = value => typeof value === 'string' && /^\d{4}$/.test(value);
const hashPin = pin => { const salt = randomBytes(16).toString('hex'); return { salt, pinHash: scryptSync(pin, salt, 64).toString('hex') }; };
const verifyPin = (pin, stored) => {
  const actual = scryptSync(pin, stored?.salt || '0'.repeat(32), 64);
  const expected = Buffer.from(stored?.pinHash || '0'.repeat(128), 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
};

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 2048) { reject(new Error('요청이 너무 큽니다.')); request.destroy(); } });
    request.on('end', () => { try { resolveBody(JSON.parse(body || '{}')); } catch { reject(new Error('잘못된 요청입니다.')); } });
    request.on('error', reject);
  });
}

export default function localRosterPlugin() {
  let root;
  const sessions = new Map();
  const attempts = new Map();
  let rosterCache;
  function roster() {
    if (rosterCache) return rosterCache;
    const file = resolve(root, 'studentlist.csv');
    if (!existsSync(file)) return null;
    const rows = parse(readFileSync(file, 'utf8'), { bom: true, columns: true, skip_empty_lines: true, trim: true });
    const students = new Map();
    for (const [index, row] of rows.entries()) {
      const rawNumber = String(row.number ?? row['번호'] ?? row.studentNumber ?? '');
      const number = normalize(rawNumber);
      const pin = String(row.password ?? row['비밀번호'] ?? row.pin ?? '');
      if (!/^\d{1,6}$/.test(rawNumber) || Number(number) < 1 || !validPin(pin)) throw new Error(`studentlist.csv ${index + 2}행의 번호 또는 4자리 비밀번호 형식을 확인해 주세요.`);
      if (students.has(number)) throw new Error(`studentlist.csv ${index + 2}행의 학생 번호가 중복됩니다.`);
      const nickname = String(row.name || row['이름'] || row.nickname || row['별명'] || `학생 ${number}`).trim();
      if (!nickname || nickname.length > 30) throw new Error(`studentlist.csv ${index + 2}행의 이름은 1~30자로 입력해 주세요.`);
      students.set(number, { id: `local-student-${number}`, nickname, ...hashPin(pin) });
    }
    rosterCache = students;
    return students;
  }
  function overrides() {
    const file = resolve(root, '.private', 'pin-overrides.json');
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  }
  function adminCredential() {
    const file = resolve(root, '.private', 'admin-credential.json');
    if (!existsSync(file)) return null;
    const credential = JSON.parse(readFileSync(file, 'utf8'));
    if (!/^[a-f0-9]{32}$/i.test(credential.salt ?? '') || !/^[a-f0-9]{128}$/i.test(credential.pinHash ?? '') || !['string', 'number'].includes(typeof credential.authVersion)) return null;
    return credential;
  }
  function persistPin(number, pin) {
    const values = overrides();
    values[number] = { ...hashPin(pin), changedAt: Date.now() };
    const directory = resolve(root, '.private');
    mkdirSync(directory, { recursive: true });
    const temporary = resolve(directory, 'pin-overrides.tmp');
    writeFileSync(temporary, JSON.stringify(values, null, 2), { mode: 0o600 });
    renameSync(temporary, resolve(directory, 'pin-overrides.json'));
  }
  const getCounter = key => {
    const value = attempts.get(key);
    if (value && Date.now() - value.startedAt < WINDOW) return value;
    const fresh = { count: 0, startedAt: Date.now() };
    attempts.set(key, fresh);
    return fresh;
  };
  const reply = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(body));
  };
  return {
    name: 'money-clover-private-local-roster',
    config: () => ({ server: { fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/*.csv', '**/.private/**', '**/scripts/**'] } } }),
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.watcher.on('change', file => { if (resolve(file) === resolve(root, 'studentlist.csv')) { rosterCache = undefined; sessions.clear(); } });
      server.middlewares.use(async (request, response, next) => {
        let path;
        try { path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { return reply(response, 400, { error: '잘못된 경로입니다.' }); }
        if (/\.csv$/i.test(path) || /\/(?:\.private|scripts)(?:\/|$)/i.test(path)) return reply(response, 403, { error: '비공개 파일입니다.' });
        if (!path.startsWith('/api/local/')) return next();
        try {
          const host = new URL(`http://${request.headers.host}`).hostname;
          if (!isLoopback(request.socket.remoteAddress) || !['localhost', '127.0.0.1', '[::1]'].includes(host)) return reply(response, 403, { error: '명단 미리보기는 localhost에서만 사용할 수 있어요.' });
          if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) return reply(response, 403, { error: '허용되지 않은 요청입니다.' });
          const students = roster();
          if (path === '/api/local/status' && request.method === 'GET') return reply(response, 200, { available: Boolean(students), count: students?.size ?? 0 });
          if (!students) return reply(response, 404, { error: '로컬 명단이 없습니다.' });
          const token = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('clover_local_session='))?.split('=')[1];
          const session = sessions.get(token);
          const active = session && session.role !== 'admin' && session.expiresAt > Date.now() && students.get(session.number);
          const credential = session?.role === 'admin' ? adminCredential() : null;
          const adminActive = session?.role === 'admin' && session.expiresAt > Date.now() && credential && session.authVersion === credential.authVersion;
          const adminAccount = { id: 'admin', nickname: '선생님', role: 'admin' };
          if (path === '/api/local/session' && request.method === 'GET') return reply(response, 200, { account: adminActive ? adminAccount : active ? { id: active.id, nickname: active.nickname } : null });
          if (path === '/api/local/admin/students' && request.method === 'GET') {
            if (!adminActive) return reply(response, 403, { error: '관리자로 로그인해 주세요.' });
            return reply(response, 200, { students: [...students.values()].map(student => ({ id: student.id, name: student.nickname })) });
          }
          if (request.method !== 'POST' || !request.headers['content-type']?.startsWith('application/json')) return reply(response, 405, { error: '허용되지 않은 요청입니다.' });
          if (path === '/api/local/logout') {
            sessions.delete(token);
            response.setHeader('Set-Cookie', 'clover_local_session=; HttpOnly; SameSite=Strict; Path=/api/local; Max-Age=0');
            return reply(response, 200, { ok: true });
          }
          const body = await readJsonBody(request);
          if (path === '/api/local/admin/login') {
            if (!validPin(body.pin)) return reply(response, 400, { error: '숫자 4자리 관리자 비밀번호를 입력해 주세요.' });
            const counter = getCounter('admin');
            if (counter.count >= 5) return reply(response, 429, { error: '시도 횟수가 많아요. 15분 뒤 다시 시도해 주세요.' });
            const stored = adminCredential();
            if (!verifyPin(body.pin, stored) || !stored) {
              counter.count += 1;
              return reply(response, 403, { error: '관리자 비밀번호가 맞지 않아요.' });
            }
            if (token) sessions.delete(token);
            const newToken = randomBytes(32).toString('hex');
            sessions.set(newToken, { role: 'admin', authVersion: stored.authVersion, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
            response.setHeader('Set-Cookie', `clover_local_session=${newToken}; HttpOnly; SameSite=Strict; Path=/api/local; Max-Age=604800`);
            return reply(response, 200, { account: adminAccount });
          }
          const changing = path === '/api/local/change-password';
          if (!changing && path !== '/api/local/login') return reply(response, 404, { error: '요청을 찾지 못했어요.' });
          if (changing && !active) return reply(response, 401, { error: '다시 로그인해 주세요.' });
          if (changing && body.accountId !== active.id) return reply(response, 401, { error: '다른 학생으로 로그인되어 있어요. 다시 로그인해 주세요.' });
          const rawNumber = changing ? session.number : String(body.studentNumber ?? '').trim();
          const number = normalize(rawNumber);
          const pin = changing ? body.currentPin : body.pin;
          if (!/^\d{1,6}$/.test(rawNumber) || Number(number) < 1 || !validPin(pin) || (changing && !validPin(body.newPin))) return reply(response, 400, { error: '학생 번호와 숫자 4자리 비밀번호를 확인해 주세요.' });
          const limits = [{ counter: getCounter(`student-${number}`), max: 5 }, { counter: getCounter('localhost'), max: 100 }];
          if (limits.some(item => item.counter.count >= item.max)) return reply(response, 429, { error: '시도 횟수가 많아요. 15분 뒤 다시 시도해 주세요.' });
          const student = students.get(number);
          const stored = overrides()[number] || student;
          if (!verifyPin(pin, stored) || !student) {
            limits.forEach(item => { item.counter.count += 1; });
            return reply(response, 403, { error: changing ? '현재 비밀번호가 맞지 않아요.' : '학생 번호와 비밀번호가 맞지 않아요.' });
          }
          if (changing) {
            if (body.newPin === pin) return reply(response, 400, { error: '현재 비밀번호와 다른 번호로 정해 주세요.' });
            persistPin(number, body.newPin);
            // Other local sessions must use the changed PIN on next login.
            for (const [key, value] of sessions) if (value.number === number && key !== token) sessions.delete(key);
            return reply(response, 200, { ok: true });
          }
          if (token) sessions.delete(token);
          const newToken = randomBytes(32).toString('hex');
          sessions.set(newToken, { number, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 });
          response.setHeader('Set-Cookie', `clover_local_session=${newToken}; HttpOnly; SameSite=Strict; Path=/api/local; Max-Age=604800`);
          return reply(response, 200, { account: { id: student.id, nickname: student.nickname } });
        } catch (error) {
          // Error messages contain only row numbers or filesystem errors, never CSV values.
          return reply(response, 500, { error: error.message?.startsWith('studentlist.csv') ? error.message : '로컬 명단을 읽거나 저장하지 못했어요. 선생님께 알려 주세요.' });
        }
      });
    },
  };
}
