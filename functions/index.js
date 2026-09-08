import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

initializeApp();
const db = getFirestore();
const windowMs = 15 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');

export const bindStudent = onCall({ region: 'asia-northeast3', maxInstances: 10, invoker: 'public' }, async request => {
  if (!request.auth || request.auth.token.firebase?.sign_in_provider !== 'anonymous') throw new HttpsError('unauthenticated', '익명 로그인이 필요합니다.');
  const rawNumber = String(request.data?.studentNumber ?? '').trim();
  const studentNumber = rawNumber.replace(/^0+(?=\d)/, '').padStart(2, '0');
  const pin = request.data?.pin;
  if (!/^\d{1,6}$/.test(rawNumber) || Number(studentNumber) < 1 || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new HttpsError('invalid-argument', '번호와 비밀번호를 확인해 주세요.');
  const now = Date.now();
  const limits = [
    { id: `student-${studentNumber}`, max: 5 },
    { id: `uid-${request.auth.uid}`, max: 10 },
    { id: `ip-${digest(request.rawRequest.ip || 'unknown')}`, max: 100 },
  ].map(item => ({ ...item, ref: db.doc(`loginAttempts/${item.id}`) }));
  const credentialRef = db.doc(`studentCredentials/${studentNumber}`);
  // A transaction prevents simultaneous requests bypassing attempt limits.
  const result = await db.runTransaction(async transaction => {
    const [credential, ...attempts] = await transaction.getAll(credentialRef, ...limits.map(item => item.ref));
    const counters = attempts.map(snapshot => {
      const value = snapshot.data();
      return value && now - value.startedAt < windowMs ? value : { startedAt: now, count: 0 };
    });
    if (counters.some((value, index) => value.count >= limits[index].max)) return { error: 'resource-exhausted' };
    const stored = credential.data();
    const salt = stored?.salt || '00000000000000000000000000000000';
    const computed = scryptSync(pin, salt, 64);
    const expected = Buffer.from(stored?.pinHash || '00'.repeat(64), 'hex');
    const matches = expected.length === computed.length && timingSafeEqual(computed, expected);
    const student = stored?.studentId ? await transaction.get(db.doc(`students/${stored.studentId}`)) : null;
    if (!stored || !matches || !student?.data()?.active) {
      limits.forEach((limit, index) => transaction.set(limit.ref, {
        startedAt: counters[index].startedAt,
        count: counters[index].count + 1,
        expiresAt: Timestamp.fromMillis(now + windowMs),
      }));
      return { error: 'permission-denied' };
    }
    transaction.set(db.doc(`memberships/${request.auth.uid}`), {
      studentId: stored.studentId, studentNumber, nickname: stored.nickname, boundAt: now, authVersion: student.data().authVersion ?? 0,
    });
    transaction.delete(db.doc(`admins/${request.auth.uid}`));
    // Keep failed attempts until the window expires, including after successful login.
    return { id: stored.studentId, nickname: stored.nickname };
  });
  if (result.error) throw new HttpsError(result.error, result.error === 'resource-exhausted' ? '15분 뒤 다시 시도해 주세요.' : '번호와 비밀번호를 확인해 주세요.');
  return result;
});

export const adminLogin = onCall({ region: 'asia-northeast3', maxInstances: 10, invoker: 'public' }, async request => {
  if (!request.auth || request.auth.token.firebase?.sign_in_provider !== 'anonymous') throw new HttpsError('unauthenticated', '다시 로그인해 주세요.');
  const pin = request.data?.pin;
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new HttpsError('invalid-argument', '관리자 비밀번호 숫자 4자리를 입력해 주세요.');
  const now = Date.now();
  // The global limit also covers callers who repeatedly create anonymous accounts.
  const limits = [
    { id: 'admin-global', max: 10 },
    { id: `admin-uid-${request.auth.uid}`, max: 5 },
    { id: `admin-ip-${digest(request.rawRequest.ip || 'unknown')}`, max: 10 },
  ].map(item => ({ ...item, ref: db.doc(`loginAttempts/${item.id}`) }));
  const result = await db.runTransaction(async transaction => {
    const [credential, ...attempts] = await transaction.getAll(db.doc('adminSettings/main'), ...limits.map(item => item.ref));
    const counters = attempts.map(snapshot => {
      const value = snapshot.data();
      return value && now - value.startedAt < windowMs ? value : { startedAt: now, count: 0 };
    });
    if (counters.some((value, index) => value.count >= limits[index].max)) return { error: 'resource-exhausted' };
    const stored = credential.data();
    const computed = scryptSync(pin, stored?.salt || '0'.repeat(32), 64);
    const expected = Buffer.from(stored?.pinHash || '0'.repeat(128), 'hex');
    const matches = expected.length === computed.length && timingSafeEqual(computed, expected);
    if (!stored || stored.active !== true || !matches) {
      limits.forEach((limit, index) => transaction.set(limit.ref, {
        startedAt: counters[index].startedAt, count: counters[index].count + 1,
        expiresAt: Timestamp.fromMillis(now + windowMs),
      }));
      return { error: 'permission-denied' };
    }
    transaction.set(db.doc(`admins/${request.auth.uid}`), {
      role: 'teacher', authVersion: stored.authVersion ?? 0, createdAt: now,
    });
    transaction.delete(db.doc(`memberships/${request.auth.uid}`));
    return { id: 'admin', nickname: '선생님', role: 'admin' };
  });
  if (result.error) throw new HttpsError(result.error, result.error === 'resource-exhausted' ? '시도 횟수가 많아요. 15분 뒤 다시 시도해 주세요.' : '관리자 비밀번호를 확인해 주세요.');
  return result;
});

export const changeStudentPassword = onCall({ region: 'asia-northeast3', maxInstances: 10, invoker: 'public' }, async request => {
  if (!request.auth || request.auth.token.firebase?.sign_in_provider !== 'anonymous') throw new HttpsError('unauthenticated', '다시 로그인해 주세요.');
  const { currentPin, newPin } = request.data || {};
  if (typeof currentPin !== 'string' || !/^\d{4}$/.test(currentPin) || typeof newPin !== 'string' || !/^\d{4}$/.test(newPin) || currentPin === newPin) throw new HttpsError('invalid-argument', '현재와 다른 숫자 4자리 비밀번호를 입력해 주세요.');
  const membershipRef = db.doc(`memberships/${request.auth.uid}`);
  const membership = await membershipRef.get();
  if (!membership.exists) throw new HttpsError('unauthenticated', '다시 로그인해 주세요.');
  const studentNumber = membership.data().studentNumber || membership.data().studentId?.replace(/^student-/, '');
  if (!/^\d{2,6}$/.test(studentNumber)) throw new HttpsError('unauthenticated', '다시 로그인해 주세요.');
  const now = Date.now();
  const limits = [
    { id: `student-${studentNumber}`, max: 5 },
    { id: `uid-${request.auth.uid}`, max: 10 },
    { id: `ip-${digest(request.rawRequest.ip || 'unknown')}`, max: 100 },
  ].map(item => ({ ...item, ref: db.doc(`loginAttempts/${item.id}`) }));
  const credentialRef = db.doc(`studentCredentials/${studentNumber}`);
  const salt = randomBytes(16).toString('hex');
  const pinHash = scryptSync(newPin, salt, 64).toString('hex');
  const result = await db.runTransaction(async transaction => {
    const [credential, currentMembership, ...attempts] = await transaction.getAll(credentialRef, membershipRef, ...limits.map(item => item.ref));
    const stored = credential.data();
    const member = currentMembership.data();
    if (!stored || !member || stored.studentId !== member.studentId || request.data.studentId !== stored.studentId) return { error: 'unauthenticated' };
    const studentRef = db.doc(`students/${stored.studentId}`);
    const student = await transaction.get(studentRef);
    if (!student.data()?.active || (member.authVersion ?? 0) !== (student.data().authVersion ?? 0)) return { error: 'unauthenticated' };
    const counters = attempts.map(snapshot => {
      const value = snapshot.data();
      return value && now - value.startedAt < windowMs ? value : { startedAt: now, count: 0 };
    });
    if (counters.some((value, index) => value.count >= limits[index].max)) return { error: 'resource-exhausted' };
    const computed = scryptSync(currentPin, stored.salt, 64);
    const expected = Buffer.from(stored.pinHash, 'hex');
    if (expected.length !== computed.length || !timingSafeEqual(computed, expected)) {
      limits.forEach((limit, index) => transaction.set(limit.ref, {
        startedAt: counters[index].startedAt, count: counters[index].count + 1, expiresAt: Timestamp.fromMillis(now + windowMs),
      }));
      return { error: 'permission-denied' };
    }
    const authVersion = (student.data().authVersion ?? 0) + 1;
    transaction.update(credentialRef, { salt, pinHash, passwordChangedAt: now });
    transaction.update(studentRef, { authVersion });
    transaction.update(membershipRef, { authVersion });
    return { ok: true };
  });
  if (result.error) throw new HttpsError(result.error, result.error === 'resource-exhausted' ? '15분 뒤 다시 시도해 주세요.' : '현재 비밀번호를 확인하거나 다시 로그인해 주세요.');
  return result;
});
