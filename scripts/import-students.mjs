import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes, scryptSync } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { parse } = require('csv-parse/sync');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const args = process.argv.slice(2);
const file = args.find(arg => !arg.startsWith('--'));
const projectId = args.find(arg => arg.startsWith('--project='))?.slice(10);
const apply = args.includes('--apply');
const resetPins = args.includes('--reset-pins');
if (!file || !projectId) {
  console.error('사용법: node scripts/import-students.mjs studentlist.csv --project=PROJECT_ID [--apply] [--reset-pins]');
  process.exit(1);
}
if (apply && resolve(file) === fileURLToPath(new URL('./students.example.csv', import.meta.url))) {
  throw new Error('공개 예시 명단은 Firebase에 등록할 수 없습니다. 실제 학생의 비밀번호로 별도 CSV를 만들어 주세요.');
}
const records = parse(readFileSync(file, 'utf8'), { bom: true, columns: true, skip_empty_lines: true, trim: true });
if (!records.length) throw new Error('CSV에 학생이 없습니다.');
const seen = new Set();
const students = records.map((record, index) => {
  const rawNumber = String(record['번호'] ?? record.number ?? record.studentNumber ?? '');
  const number = rawNumber.replace(/^0+(?=\d)/, '').padStart(2, '0');
  const pin = String(record['비밀번호'] ?? record.password ?? record.pin ?? '');
  const nickname = String(record['이름'] || record.name || record['별명'] || record.nickname || `학생 ${number}`).trim();
  if (!/^\d{1,6}$/.test(rawNumber) || Number(number) < 1 || !/^\d{4}$/.test(pin)) throw new Error(`${index + 2}행: 번호와 숫자 4자리 비밀번호를 확인해 주세요. (앞자리 0 포함)`);
  if (seen.has(number)) throw new Error(`${index + 2}행: 학생 번호가 중복됩니다.`);
  if (!nickname || nickname.length > 30) throw new Error(`${index + 2}행: 이름은 1~30자로 입력해 주세요.`);
  seen.add(number);
  const salt = randomBytes(16).toString('hex');
  return { number, studentId: `student-${number}`, nickname, salt, pinHash: scryptSync(pin, salt, 64).toString('hex') };
});
console.log(`${students.length}명의 명단 형식 검증 완료. 이름은 로그인한 본인에게 표시하며, 비밀번호는 해시로만 저장합니다.`);
if (!apply) {
  console.log('검증만 했으며 서버를 변경하지 않았습니다. 실제 등록 시 --apply를 추가하세요.');
  process.exit(0);
}
if (args.includes('--firebase-cli')) {
  const { googleRequest } = await import('./firebase-cli-session.mjs');
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const read = async path => {
    try { return await googleRequest(`${base}/${path}`); }
    catch (error) { if (error.status === 404) return null; throw error; }
  };
  const string = value => ({ stringValue: value });
  const integer = value => ({ integerValue: String(value) });
  for (const student of students) {
    const paths = [`studentCredentials/${student.number}`, `students/${student.studentId}`];
    const [existingCredential, existingStudent] = await Promise.all(paths.map(read));
    const reset = Boolean(existingCredential && resetPins);
    const authVersion = Number(existingStudent?.fields?.authVersion?.integerValue || 0) + (reset ? 1 : 0);
    const credentialFields = { ...existingCredential?.fields, studentId: string(student.studentId), nickname: string(student.nickname) };
    if (!existingCredential || resetPins) Object.assign(credentialFields, { salt: string(student.salt), pinHash: string(student.pinHash), passwordChangedAt: integer(Date.now()) });
    const studentFields = { ...existingStudent?.fields, active: { booleanValue: true }, nickname: string(student.nickname), authVersion: integer(authVersion) };
    const writes = [credentialFields, studentFields].map((fields, index) => {
      const existing = [existingCredential, existingStudent][index];
      return { update: { name: `projects/${projectId}/databases/(default)/documents/${paths[index]}`, fields }, currentDocument: existing ? { updateTime: existing.updateTime } : { exists: false } };
    });
    await googleRequest(`${base}:commit`, { method: 'POST', body: { writes } });
  }
  console.log(`${students.length}명 등록 완료. 기존 장부와 비밀번호는 명시적 초기화 옵션 없이는 변경하지 않습니다.`);
  process.exit(0);
}
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
// Preserve existing PIN hashes by default. Explicit reset invalidates older sessions.
for (const student of students) {
  await db.runTransaction(async transaction => {
    const credentialRef = db.doc(`studentCredentials/${student.number}`);
    const studentRef = db.doc(`students/${student.studentId}`);
    const [existingCredential, existingStudent] = await transaction.getAll(credentialRef, studentRef);
    const reset = existingCredential.exists && resetPins;
    const authVersion = (existingStudent.data()?.authVersion ?? 0) + (reset ? 1 : 0);
    transaction.set(studentRef, { active: true, nickname: student.nickname, authVersion }, { merge: true });
    const value = { studentId: student.studentId, nickname: student.nickname };
    if (!existingCredential.exists || resetPins) Object.assign(value, { salt: student.salt, pinHash: student.pinHash, passwordChangedAt: Date.now() });
    transaction.set(credentialRef, value, { merge: true });
  });
}
console.log(`${students.length}명 등록 완료. ${resetPins ? '비밀번호를 CSV 값으로 초기화했으며 기존 기기는 다시 로그인해야 합니다.' : '기존 학생의 변경된 비밀번호를 보존했습니다.'} CSV에 없는 학생은 자동 삭제하지 않습니다.`);
