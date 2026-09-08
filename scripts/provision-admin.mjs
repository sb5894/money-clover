import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const local = args.includes('--local');
const reset = args.includes('--reset');
const pin = args.find(value => value.startsWith('--pin='))?.slice(6) ?? (!process.stdin.isTTY ? readFileSync(0, 'utf8').trim() : '');
if (!/^\d{4}$/.test(pin)) throw new Error('사용법: node scripts/provision-admin.mjs --pin=숫자4자리 [--local] [--project=money-clover] [--reset]');
const salt = randomBytes(16).toString('hex');
const hashed = { salt, pinHash: scryptSync(pin, salt, 64).toString('hex'), active: true, passwordChangedAt: Date.now() };

if (local) {
  const directory = resolve('.private');
  const destination = resolve(directory, 'admin-credential.json');
  const existing = existsSync(destination) ? JSON.parse(readFileSync(destination, 'utf8')) : null;
  if (existing && !reset) {
    console.log('기존 로컬 관리자 비밀번호를 유지했습니다.');
  } else {
    mkdirSync(directory, { recursive: true });
    const temporary = resolve(directory, `admin-credential-${randomBytes(8).toString('hex')}.tmp`);
    writeFileSync(temporary, JSON.stringify({ ...hashed, authVersion: (existing?.authVersion ?? -1) + 1 }), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, destination);
    console.log('로컬 관리자 비밀번호를 암호화해 등록했습니다.');
  }
} else {
  const projectId = args.find(value => value.startsWith('--project='))?.slice(10) || JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.default;
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('Firebase 프로젝트 ID를 확인해 주세요.');
  const { googleRequest } = await import('./firebase-cli-session.mjs');
  const name = `projects/${projectId}/databases/(default)/documents/adminSettings/main`;
  let existing;
  try { existing = await googleRequest(`https://firestore.googleapis.com/v1/${name}`); }
  catch (error) { if (error.status !== 404) throw error; }
  if (existing && !reset) {
    console.log('기존 Firebase 관리자 비밀번호를 유지했습니다.');
  } else {
    const fields = {
      salt: { stringValue: hashed.salt }, pinHash: { stringValue: hashed.pinHash }, active: { booleanValue: true },
      passwordChangedAt: { integerValue: String(hashed.passwordChangedAt) },
      authVersion: { integerValue: String(Number(existing?.fields?.authVersion?.integerValue ?? -1) + 1) },
    };
    await googleRequest(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
      method: 'POST', body: { writes: [{ update: { name, fields }, currentDocument: existing ? { updateTime: existing.updateTime } : { exists: false } }] },
    });
    console.log(`Firebase ${projectId} 관리자 비밀번호를 암호화해 등록했습니다.`);
  }
}
