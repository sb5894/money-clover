import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLedger, summarizeDay, validateEntry, shiftDate } from '../src/ledger.js';

const entry = (id, date, kind, amount, createdAt = 1) => ({ id, date, kind, amount, createdAt, description: '용돈' });
test('날짜순 잔액, 하루 합계와 이전 잔액을 계산한다', () => {
  const entries = [entry('b', '2026-09-08', 'expense', 2500, 2), entry('a', '2026-09-07', 'income', 10000), entry('c', '2026-09-08', 'income', 5000, 3)];
  assert.deepEqual(calculateLedger(entries).map(item => item.balance), [10000, 7500, 12500]);
  const day = summarizeDay(entries, '2026-09-08');
  assert.equal(day.openingBalance, 10000);
  assert.equal(day.closingBalance, 12500);
  assert.equal(day.income, 5000);
  assert.equal(day.expense, 2500);
  assert.equal(entries[0].id, 'b');
});
test('과거 기록 수정과 삭제가 이후 잔액에 반영된다', () => {
  const entries = [entry('a', '2026-09-07', 'income', 20000), entry('b', '2026-09-08', 'expense', 2500)];
  assert.equal(summarizeDay(entries, '2026-09-08').closingBalance, 17500);
  assert.equal(summarizeDay(entries.slice(1), '2026-09-08').closingBalance, -2500);
  assert.equal(summarizeDay(entries, '2026-09-09').closingBalance, 17500);
  assert.equal(summarizeDay(entries, '2026-09-06').closingBalance, 0);
});
test('같은 날 정렬은 생성 순서이고 빈 장부는 0원이다', () => {
  assert.deepEqual(calculateLedger([entry('b', '2026-09-08', 'expense', 100, 2), entry('a', '2026-09-08', 'income', 1000, 1)]).map(item => item.id), ['a', 'b']);
  assert.equal(summarizeDay([], '2026-09-08').totalBalance, 0);
});
test('잘못된 금액, 날짜, 빈 내용을 거부한다', () => {
  const base = entry('a', '2026-09-08', 'income', 1000);
  for (const amount of [0, -1, 1.5, NaN, Infinity, '', '1e3', 1000000000]) assert.throws(() => validateEntry({ ...base, amount }));
  for (const date of ['2026-02-30', '2026-13-01', '2026-2-01', 'hello']) assert.throws(() => validateEntry({ ...base, date }));
  assert.throws(() => validateEntry({ ...base, description: '  ' }));
  assert.throws(() => validateEntry({ ...base, kind: 'other' }));
  assert.equal(validateEntry({ ...base, amount: '1234', description: ' 용돈 ' }).amount, 1234);
  assert.equal(validateEntry({ ...base, description: ' 용돈 ' }).description, '용돈');
});
test('월, 연도, 윤년을 넘어 날짜를 이동한다', () => {
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDate('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftDate('2026-02-28', 1), '2026-03-01');
});
