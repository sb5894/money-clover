import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import localRosterPlugin from './dev-roster.js';

async function start(root) {
  let middleware;
  const plugin = localRosterPlugin();
  plugin.configResolved({ root });
  plugin.configureServer({ watcher: { on() {} }, middlewares: { use(handler) { middleware = handler; } } });
  const server = createServer((request, response) => middleware(request, response, () => { response.writeHead(404); response.end(); }));
  await new Promise(resolveStart => server.listen(0, '127.0.0.1', resolveStart));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function stop(server) { await new Promise(resolveStop => server.close(resolveStop)); }
const post = (url, path, body, cookie) => fetch(`${url}/api/local/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
const get = (url, path, cookie) => fetch(`${url}/api/local/${path}`, { headers: cookie ? { Cookie: cookie } : {} });
const sessionCookie = response => response.headers.get('set-cookie').split(';')[0];
function provisionAdmin(directory, pin, authVersion = 'test-version-1') {
  const salt = randomBytes(16).toString('hex');
  mkdirSync(join(directory, '.private'), { recursive: true });
  writeFileSync(join(directory, '.private', 'admin-credential.json'), JSON.stringify({ salt, pinHash: scryptSync(pin, salt, 64).toString('hex'), authVersion }));
}

test('private CSV login preserves leading-zero PIN, supports change and restart without modifying CSV', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'money-clover-roster-test-'));
  const csv = 'number,name,password\n1,가상학생,0123\n';
  writeFileSync(join(directory, 'studentlist.csv'), csv);
  let instance;
  try {
    instance = await start(directory);
    assert.deepEqual(await (await fetch(`${instance.url}/api/local/status`)).json(), { available: true, count: 1 });
    assert.equal((await fetch(`${instance.url}/studentlist.csv?raw`)).status, 403);
    assert.equal((await fetch(`${instance.url}/.private/pin-overrides.json`)).status, 403);
    const wrong = await post(instance.url, 'login', { studentNumber: '01', pin: '9999' });
    assert.equal(wrong.status, 403);
    const login = await post(instance.url, 'login', { studentNumber: '1', pin: '0123' });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { account: { id: 'local-student-01', nickname: '가상학생' } });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    const changed = await post(instance.url, 'change-password', { accountId: 'local-student-01', currentPin: '0123', newPin: '0567' }, cookie);
    assert.equal(changed.status, 200);
    assert.equal(readFileSync(join(directory, 'studentlist.csv'), 'utf8'), csv);
    const stored = JSON.parse(readFileSync(join(directory, '.private', 'pin-overrides.json'), 'utf8'))['01'];
    assert.equal(stored.pinHash.length, 128);
    assert.equal(stored.salt.length, 32);
    assert.equal('pin' in stored, false);
    assert.equal((await post(instance.url, 'login', { studentNumber: '1', pin: '0123' })).status, 403);
    assert.equal((await post(instance.url, 'login', { studentNumber: '1', pin: '0567' })).status, 200);
    await stop(instance.server);
    instance = await start(directory);
    assert.equal((await post(instance.url, 'login', { studentNumber: '01', pin: '0567' })).status, 200);
    assert.equal((await post(instance.url, 'change-password', { currentPin: '0567', newPin: '1234' })).status, 401);
  } finally {
    if (instance) await stop(instance.server);
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'));
    rmSync(directory, { recursive: true });
  }
});

test('five wrong PINs enforce a student limit even with new sessions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'money-clover-roster-test-'));
  writeFileSync(join(directory, 'studentlist.csv'), '번호,이름,비밀번호\n01,가상학생,1234\n');
  const instance = await start(directory);
  try {
    for (let index = 0; index < 5; index += 1) assert.equal((await post(instance.url, 'login', { studentNumber: '01', pin: '9999' })).status, 403);
    assert.equal((await post(instance.url, 'login', { studentNumber: '01', pin: '1234' })).status, 429);
    assert.equal((await fetch(`${instance.url}/api/local/status`, { headers: { Origin: 'https://example.com' } })).status, 403);
  } finally {
    await stop(instance.server);
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'));
    rmSync(directory, { recursive: true });
  }
});

test('admin session lists only student metadata, restores, and cannot change student passwords', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'money-clover-admin-test-'));
  writeFileSync(join(directory, 'studentlist.csv'), 'number,name,password\n1,가상학생,0123\n2,테스트학생,4567\n');
  provisionAdmin(directory, '8765');
  const instance = await start(directory);
  try {
    assert.equal((await get(instance.url, 'admin/students')).status, 403);
    assert.equal((await get(instance.url, 'admin/students', 'clover_local_session=forged')).status, 403);
    assert.equal((await post(instance.url, 'admin/login', { pin: '123' })).status, 400);
    assert.equal((await post(instance.url, 'admin/login', { pin: '1111' })).status, 403);
    assert.equal((await post(instance.url, 'login', { studentNumber: '01', pin: '8765' })).status, 403);
    const studentLogin = await post(instance.url, 'login', { studentNumber: '01', pin: '0123' });
    assert.equal(studentLogin.status, 200);
    const studentCookie = sessionCookie(studentLogin);
    assert.equal((await get(instance.url, 'admin/students', studentCookie)).status, 403);
    const login = await post(instance.url, 'admin/login', { pin: '8765' }, studentCookie);
    assert.equal(login.status, 200);
    const account = { id: 'admin', nickname: '선생님', role: 'admin' };
    assert.deepEqual(await login.json(), { account });
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/api\/local/);
    const cookie = sessionCookie(login);
    assert.deepEqual(await (await get(instance.url, 'session', cookie)).json(), { account });
    assert.deepEqual(await (await get(instance.url, 'session', studentCookie)).json(), { account: null });
    assert.deepEqual(await (await get(instance.url, 'admin/students', cookie)).json(), { students: [
      { id: 'local-student-01', name: '가상학생' },
      { id: 'local-student-02', name: '테스트학생' },
    ] });
    assert.equal((await post(instance.url, 'change-password', { accountId: 'local-student-01', currentPin: '0123', newPin: '9999' }, cookie)).status, 401);
    for (const path of ['/scripts/dev-roster.js', '/scripts', '/%73cripts/dev-roster.js?raw', '/@fs/C:/workspace/scripts/setup.js', '/.private/admin-credential.json']) {
      assert.equal((await fetch(`${instance.url}${path}`)).status, 403, path);
    }
    assert.ok(localRosterPlugin().config().server.fs.deny.includes('**/scripts/**'));
    const logout = await post(instance.url, 'logout', {}, cookie);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await get(instance.url, 'admin/students', cookie)).status, 403);
    const relogin = await post(instance.url, 'admin/login', { pin: '8765' });
    const newCookie = sessionCookie(relogin);
    provisionAdmin(directory, '7654', 'test-version-2');
    assert.deepEqual(await (await get(instance.url, 'session', newCookie)).json(), { account: null });
    assert.equal((await get(instance.url, 'admin/students', newCookie)).status, 403);
    assert.equal((await post(instance.url, 'admin/login', { pin: '8765' })).status, 403);
    assert.equal((await post(instance.url, 'admin/login', { pin: '7654' })).status, 200);
  } finally {
    await stop(instance.server);
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'));
    rmSync(directory, { recursive: true });
  }
});

test('five admin failures share a limit across sessions without blocking student login', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'money-clover-admin-limit-test-'));
  writeFileSync(join(directory, 'studentlist.csv'), 'number,name,password\n1,가상학생,0123\n');
  provisionAdmin(directory, '8765');
  const instance = await start(directory);
  try {
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await post(instance.url, 'admin/login', { pin: '1111' }, `clover_local_session=fake-${index}`)).status, 403);
    }
    assert.equal((await post(instance.url, 'admin/login', { pin: '8765' })).status, 429);
    assert.equal((await post(instance.url, 'login', { studentNumber: '01', pin: '0123' })).status, 200);
  } finally {
    await stop(instance.server);
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + '\\') || resolve(directory).startsWith(resolve(tmpdir()) + '/'));
    rmSync(directory, { recursive: true });
  }
});
