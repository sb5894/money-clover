import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { formatDate, shiftDate, validateEntry } from './ledger.js';

const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const configured = Object.values(config).some(Boolean);
let services;
function firebase() {
  if (services) return services;
  if (!Object.values(config).every(Boolean)) throw new Error('Firebase 설정이 아직 완성되지 않았어요. 선생님께 알려 주세요.');
  const app = initializeApp(config);
  services = { auth: getAuth(app), db: getFirestore(app), functions: getFunctions(app, env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-northeast3') };
  return services;
}

const accounts = {
  '01': { id: 'demo-clover-01', nickname: '초록 클로버' },
  '02': { id: 'demo-clover-02', nickname: '행운 클로버' },
  '03': { id: 'demo-clover-03', nickname: '햇살 클로버' },
};
export const getFirebaseServices = firebase;
const demoPins = { '01': '1234', '02': '2345', '03': '3456' };
const accountKey = 'money-clover.account.v1';
const entryKey = id => `money-clover.entries.v1.${id}`;
const eventName = 'money-clover:entries';
export const getMode = () => configured ? 'firebase' : 'local';
const demoPinKey = 'money-clover.demo-pins.v1';

async function localRequest(path, body) {
  const response = await fetch(`/api/local/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('로컬 명단 서버에 연결하지 못했어요.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청을 완료하지 못했어요.');
  return result;
}

export async function getLocalRosterInfo() {
  if (configured || !env.DEV) return { available: false, count: 0 };
  return localRequest('status');
}

function currentDemoPin(number) {
  return JSON.parse(localStorage.getItem(demoPinKey) || '{}')[number] || demoPins[number];
}

function readLocal(id) {
  const raw = localStorage.getItem(entryKey(id));
  if (raw === null) return [];
  try {
    const values = JSON.parse(raw);
    if (!Array.isArray(values)) throw new Error();
    return values.map(validateEntry);
  } catch {
    throw new Error('저장된 기록을 읽지 못했어요. 이 브라우저의 데이터를 지우기 전에 선생님께 알려 주세요.');
  }
}

function writeLocal(id, entries) {
  try { localStorage.setItem(entryKey(id), JSON.stringify(entries)); }
  catch { throw new Error('브라우저에 저장할 공간이 부족하거나 저장이 차단되어 있어요.'); }
  window.dispatchEvent(new CustomEvent(eventName, { detail: id }));
}

function seed(account) {
  if (localStorage.getItem(entryKey(account.id)) !== null) return;
  const today = formatDate();
  const yesterday = shiftDate(today, -1);
  writeLocal(account.id, [
    { id: 'sample-1', date: yesterday, description: '차곡차곡 모은 용돈', kind: 'income', amount: 12000, createdAt: 1 },
    { id: 'sample-2', date: today, description: '이번 주 용돈', kind: 'income', amount: 10000, createdAt: 2 },
    { id: 'sample-3', date: today, description: '친구와 먹은 간식', kind: 'expense', amount: 2500, createdAt: 3 },
    { id: 'sample-4', date: today, description: '새 연필 한 자루', kind: 'expense', amount: 1000, createdAt: 4 },
  ]);
}

export async function connectAccount(studentNumber, pin) {
  const rawNumber = String(studentNumber ?? '').trim();
  const number = rawNumber.replace(/^0+(?=\d)/, '').padStart(2, '0');
  const password = String(pin ?? '');
  if (!/^\d{1,6}$/.test(rawNumber) || Number(number) < 1 || !/^\d{4}$/.test(password)) throw new Error('학생 번호와 숫자 4자리 비밀번호를 확인해 주세요.');
  if (!configured) {
    if ((await getLocalRosterInfo()).available) {
      const { account } = await localRequest('login', { studentNumber: number, pin: password });
      localStorage.setItem(accountKey, account.id);
      return account;
    }
    const account = accounts[number];
    if (!account || currentDemoPin(number) !== password) throw new Error('학생 번호와 비밀번호가 맞지 않아요.');
    seed(account);
    localStorage.setItem(accountKey, account.id);
    return { ...account };
  }
  const { auth, functions } = firebase();
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  try {
    const result = await httpsCallable(functions, 'bindStudent')({ studentNumber: number, pin: password });
    return result.data;
  } catch (error) {
    if (error.code === 'functions/resource-exhausted') throw new Error('잠시 쉬었다가 다시 시도해 주세요. (최대 15분)');
    if (['functions/not-found', 'functions/permission-denied', 'functions/invalid-argument'].includes(error.code)) throw new Error('학생 번호와 비밀번호가 맞지 않아요. 선생님께 확인해 주세요.');
    throw new Error('연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }
}

export async function restoreAccount() {
  if (!configured) {
    if ((await getLocalRosterInfo()).available) return (await localRequest('session')).account;
    const id = localStorage.getItem(accountKey);
    const account = Object.values(accounts).find(item => item.id === id);
    return account ? { ...account } : null;
  }
  const { auth, db } = firebase();
  await auth.authStateReady();
  if (!auth.currentUser) return null;
  const admin = await getDoc(doc(db, 'admins', auth.currentUser.uid));
  if (admin.exists()) return { id: 'admin', nickname: '선생님', role: 'admin' };
  const membership = await getDoc(doc(db, 'memberships', auth.currentUser.uid));
  if (!membership.exists()) return null;
  const { studentId, nickname } = membership.data();
  return { id: studentId, nickname };
}

export function subscribeEntries(account, onData, onError = () => {}) {
  if (!configured) {
    const publish = () => { try { onData(readLocal(account.id)); } catch (error) { onError(error); } };
    const storage = event => { if (event.key === entryKey(account.id) || event.key === null) publish(); };
    const changed = event => { if (event.detail === account.id) publish(); };
    window.addEventListener('storage', storage);
    window.addEventListener(eventName, changed);
    publish();
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(eventName, changed); };
  }
  return onSnapshot(collection(firebase().db, 'students', account.id, 'entries'), snapshot => onData(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))), onError);
}

export async function saveEntry(account, entry) {
  const valid = validateEntry(entry);
  const id = valid.id || crypto.randomUUID();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('기록 번호가 올바르지 않아요.');
  let createdAt = Number.isSafeInteger(valid.createdAt) && valid.createdAt >= 0 ? valid.createdAt : Date.now();
  if (!configured) {
    const entries = readLocal(account.id);
    const existing = entries.find(item => item.id === id);
    if (existing) createdAt = existing.createdAt;
    const value = { id, date: valid.date, description: valid.description, amount: valid.amount, kind: valid.kind, createdAt };
    writeLocal(account.id, [...entries.filter(item => item.id !== id), value]);
    return value;
  }
  const reference = doc(firebase().db, 'students', account.id, 'entries', id);
  if (valid.id) {
    const existing = await getDoc(reference);
    if (existing.exists()) createdAt = existing.data().createdAt;
  }
  const value = { date: valid.date, description: valid.description, amount: valid.amount, kind: valid.kind, createdAt };
  await setDoc(reference, value);
  return { ...value, id };
}

export async function deleteEntry(account, id) {
  if (!configured) { writeLocal(account.id, readLocal(account.id).filter(entry => entry.id !== id)); return; }
  await deleteDoc(doc(firebase().db, 'students', account.id, 'entries', id));
}

export async function logout() {
  if (!configured) {
    if ((await getLocalRosterInfo()).available) await localRequest('logout', {});
    localStorage.removeItem(accountKey);
    return;
  }
  await signOut(firebase().auth);
}

export async function changePassword(account, currentPin, newPin) {
  if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) throw new Error('비밀번호는 숫자 4자리로 입력해 주세요.');
  if (currentPin === newPin) throw new Error('현재 비밀번호와 다른 번호로 정해 주세요.');
  if (!configured) {
    if ((await getLocalRosterInfo()).available) {
      await localRequest('change-password', { accountId: account.id, currentPin, newPin });
      return;
    }
    const number = Object.keys(accounts).find(key => accounts[key].id === account.id);
    if (!number || localStorage.getItem(accountKey) !== account.id) throw new Error('다시 로그인해 주세요.');
    if (currentDemoPin(number) !== currentPin) throw new Error('현재 비밀번호가 맞지 않아요.');
    const values = JSON.parse(localStorage.getItem(demoPinKey) || '{}');
    values[number] = newPin;
    localStorage.setItem(demoPinKey, JSON.stringify(values));
    return;
  }
  try {
    await httpsCallable(firebase().functions, 'changeStudentPassword')({ studentId: account.id, currentPin, newPin });
  } catch (error) {
    if (error.code === 'functions/resource-exhausted') throw new Error('시도 횟수가 많아요. 15분 뒤 다시 시도해 주세요.');
    if (error.code === 'functions/permission-denied') throw new Error('현재 비밀번호가 맞지 않아요.');
    if (error.code === 'functions/unauthenticated') throw new Error('다시 로그인해 주세요.');
    throw new Error('비밀번호를 바꾸지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }
}
