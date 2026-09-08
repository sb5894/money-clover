import { signInAnonymously } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseServices, getMode } from './data.js';
import { validateEntry } from './ledger.js';

async function localRequest(path, body) {
  const response = await fetch(`/api/local/admin/${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('관리자 서버에 연결하지 못했어요.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '관리자 요청을 처리하지 못했어요.');
  return result;
}

export async function connectAdmin(pin) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new Error('관리자 비밀번호 숫자 4자리를 입력해 주세요.');
  if (getMode() === 'local') return (await localRequest('login', { pin })).account;
  const { auth, functions } = getFirebaseServices();
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  try {
    return (await httpsCallable(functions, 'adminLogin')({ pin })).data;
  } catch (error) {
    if (error.code === 'functions/resource-exhausted') throw new Error('시도 횟수가 많아요. 15분 뒤 다시 시도해 주세요.');
    if (['functions/permission-denied', 'functions/invalid-argument'].includes(error.code)) throw new Error('관리자 비밀번호가 맞지 않아요.');
    throw new Error('관리자 로그인에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  }
}

export function subscribeStudents(onData, onError = () => {}) {
  let stopped = false;
  if (getMode() === 'local') {
    let students;
    const publish = () => {
      if (stopped || !students) return;
      try {
        onData(students.map(student => {
          const entries = JSON.parse(localStorage.getItem(`money-clover.entries.v1.${student.id}`) || '[]');
          if (!Array.isArray(entries)) throw new Error('학생의 저장된 기록을 읽지 못했어요.');
          return { ...student, entries: entries.map(validateEntry) };
        }));
      } catch (error) { onError(error); }
    };
    const storage = event => { if (event.key === null || event.key.startsWith('money-clover.entries.v1.')) publish(); };
    window.addEventListener('storage', storage);
    window.addEventListener('money-clover:entries', publish);
    localRequest('students').then(result => {
      students = Array.isArray(result) ? result : result.students;
      if (!Array.isArray(students)) throw new Error('학생 명단을 읽지 못했어요.');
      publish();
    }).catch(error => { if (!stopped) onError(error); });
    return () => { stopped = true; window.removeEventListener('storage', storage); window.removeEventListener('money-clover:entries', publish); };
  }
  const { db } = getFirebaseServices();
  const rows = new Map();
  const watchers = new Map();
  const loaded = new Set();
  const publish = () => {
    if (stopped || [...rows.keys()].some(id => !loaded.has(id))) return;
    onData([...rows.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })));
  };
  const fail = error => { if (!stopped) onError(error); };
  const stopRoster = onSnapshot(query(collection(db, 'students'), where('active', '==', true)), snapshot => {
    const ids = new Set(snapshot.docs.map(item => item.id));
    for (const [id, unsubscribe] of watchers) {
      if (!ids.has(id)) { unsubscribe(); watchers.delete(id); rows.delete(id); loaded.delete(id); }
    }
    for (const student of snapshot.docs) {
      rows.set(student.id, { id: student.id, name: student.data().nickname || `학생 ${student.id.replace(/^student-/, '')}`, entries: rows.get(student.id)?.entries || [] });
      if (!watchers.has(student.id)) {
        watchers.set(student.id, onSnapshot(collection(db, 'students', student.id, 'entries'), entries => {
          if (stopped || !rows.has(student.id)) return;
          rows.set(student.id, { ...rows.get(student.id), entries: entries.docs.map(item => ({ ...item.data(), id: item.id })) });
          loaded.add(student.id);
          publish();
        }, fail));
      }
    }
    publish();
  }, fail);
  return () => { stopped = true; stopRoster(); watchers.forEach(unsubscribe => unsubscribe()); };
}
