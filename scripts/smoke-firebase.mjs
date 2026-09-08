import assert from 'node:assert/strict';
import { randomBytes, randomInt, scryptSync } from 'node:crypto';
import { loadEnv } from 'vite';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, deleteUser } from 'firebase/auth';
import { getFirestore, doc, getDoc, getDocFromServer, getDocs, collection, setDoc, deleteDoc, terminate } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { googleRequest } from './firebase-cli-session.mjs';

const env = loadEnv('production', process.cwd(), 'VITE_');
const project = env.VITE_FIREBASE_PROJECT_ID;
assert.equal(project, 'money-clover');
const config = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: project, appId: env.VITE_FIREBASE_APP_ID };
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const prefix = `projects/${project}/databases/(default)/documents/`;
const studentId = `deployment-check-${randomBytes(12).toString('hex')}`;
const number = String(randomInt(900000, 999999));
const pin = String(randomInt(0, 10000)).padStart(4, '0');
const newPin = String((Number(pin) + 1) % 10000).padStart(4, '0');
const salt = randomBytes(16).toString('hex');
const pinHash = scryptSync(pin, salt, 64).toString('hex');
const clients = [], membershipIds = [];
let created = false;
const newClient = async () => {
  const app = initializeApp(config, `check-${randomBytes(6).toString('hex')}`);
  const auth = getAuth(app), db = getFirestore(app), functions = getFunctions(app, 'asia-northeast3');
  const client = { app, auth, db, functions };
  clients.push(client);
  await signInAnonymously(auth);
  membershipIds.push(auth.currentUser.uid);
  return client;
};
const bind = (client, password) => httpsCallable(client.functions, 'bindStudent')({ studentNumber: number, pin: password });
const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');

try {
  await googleRequest(`${base}:commit`, { method: 'POST', body: { writes: [
    { update: { name: `${prefix}students/${studentId}`, fields: { active: { booleanValue: true }, nickname: { stringValue: '배포 기능 확인' }, authVersion: { integerValue: '0' } } }, currentDocument: { exists: false } },
    { update: { name: `${prefix}studentCredentials/${number}`, fields: { studentId: { stringValue: studentId }, nickname: { stringValue: '배포 기능 확인' }, salt: { stringValue: salt }, pinHash: { stringValue: pinHash } } }, currentDocument: { exists: false } },
  ] } });
  created = true;
  const owner = await newClient();
  assert.equal((await bind(owner, pin)).data.id, studentId);
  const record = doc(owner.db, 'students', studentId, 'entries', 'deployment-check');
  const value = { date: '2026-09-08', description: '배포 기능 확인', kind: 'income', amount: 100, createdAt: Date.now() };
  await setDoc(record, value);
  assert.equal((await getDocFromServer(record)).data().amount, 100);
  await setDoc(record, { ...value, amount: 250 });
  assert.equal((await getDocFromServer(record)).data().amount, 250);
  await denied(getDoc(doc(owner.db, 'studentCredentials', number)));
  const outsider = await newClient();
  await denied(getDocFromServer(doc(outsider.db, 'students', studentId, 'entries', 'deployment-check')));
  await denied(setDoc(doc(outsider.db, 'students', studentId, 'entries', 'intrusion-check'), value));
  await bind(outsider, pin);
  await httpsCallable(owner.functions, 'changeStudentPassword')({ studentId, currentPin: pin, newPin });
  await denied(getDocFromServer(doc(outsider.db, 'students', studentId, 'entries', 'deployment-check')));
  await assert.rejects(bind(outsider, pin), error => error.code === 'functions/permission-denied');
  assert.equal((await bind(outsider, newPin)).data.id, studentId);
  assert.equal((await getDocFromServer(doc(outsider.db, 'students', studentId, 'entries', 'deployment-check'))).data().amount, 250);
  if (process.env.CLOVER_ADMIN_PIN) {
    const teacher = await newClient();
    await denied(getDocs(collection(teacher.db, 'students')));
    await denied(setDoc(doc(teacher.db, 'admins', teacher.auth.currentUser.uid), { role: 'teacher', authVersion: 0 }));
    assert.equal((await httpsCallable(teacher.functions, 'adminLogin')({ pin: process.env.CLOVER_ADMIN_PIN })).data.role, 'admin');
    assert.ok((await getDocs(collection(teacher.db, 'students'))).docs.some(snapshot => snapshot.id === studentId));
    const teacherRecord = doc(teacher.db, 'students', studentId, 'entries', 'deployment-check');
    assert.equal((await getDocFromServer(teacherRecord)).data().amount, 250);
    await setDoc(teacherRecord, { ...value, amount: 350 });
    assert.equal((await getDocFromServer(record)).data().amount, 350);
    await denied(getDocFromServer(doc(teacher.db, 'studentCredentials', number)));
    await bind(teacher, newPin);
    await denied(getDocs(collection(teacher.db, 'students')));
    console.log('PASS: 관리자 로그인, 전체 학생 조회, 학생 장부 접근·수정, 관리자 권한 위조 차단, 학생 전환 시 권한 해제.');
  }
  await deleteDoc(record);
  assert.equal((await getDocFromServer(record)).exists(), false);
  console.log('PASS: 실제 Firebase 로그인, 저장·수정·삭제, 다른 학생 접근 차단, 비밀번호 변경과 재로그인.');
} finally {
  for (const client of clients) {
    try { if (client.auth.currentUser) await deleteUser(client.auth.currentUser); } catch { console.log('임시 익명 계정 정리가 필요합니다.'); }
    await terminate(client.db);
    await deleteApp(client.app);
  }
  if (created) {
    const paths = [`students/${studentId}/entries/deployment-check`, `students/${studentId}/entries/intrusion-check`, `students/${studentId}`, `studentCredentials/${number}`, `loginAttempts/student-${number}`, ...membershipIds.flatMap(uid => [`memberships/${uid}`, `admins/${uid}`, `loginAttempts/uid-${uid}`, `loginAttempts/admin-uid-${uid}`])];
    await googleRequest(`${base}:commit`, { method: 'POST', body: { writes: paths.map(path => ({ delete: `${prefix}${path}` })) } });
    console.log('임시 확인 계정과 기록 정리 완료. 실제 학생 명단과 장부는 변경하지 않았습니다.');
  }
}
