import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import assert from 'node:assert/strict';
import { googleRequest } from './firebase-cli-session.mjs';

if (!process.env.CLOVER_ADMIN_PIN) throw new Error('CLOVER_ADMIN_PIN이 필요합니다.');
const students = parse(readFileSync('studentlist.csv', 'utf8'), { columns: true, bom: true, skip_empty_lines: true, trim: true });
const temporaryUsers = new Map();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', async response => {
  if (response.url().includes('identitytoolkit.googleapis.com/v1/accounts:signUp') && response.ok()) {
    const value = await response.json();
    if (value.localId && value.idToken) temporaryUsers.set(value.localId, { idToken: value.idToken, apiKey: new URL(response.url()).searchParams.get('key') });
  }
});

try {
  await page.goto('https://money-clover.web.app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '선생님 로그인', exact: true }).click();
  await page.getByLabel('관리자 비밀번호', { exact: true }).fill(process.env.CLOVER_ADMIN_PIN);
  await page.getByRole('button', { name: '관리자 로그인', exact: true }).click();
  await page.getByRole('heading', { name: '우리 반 용돈 한눈에' }).waitFor({ timeout: 45000 });
  await page.waitForFunction(count => document.querySelectorAll('.admin-students-table tbody tr button').length === count, students.length, { timeout: 45000 });
  assert.equal(await page.locator('.preview-label').count(), 0);
  assert.equal(await page.locator('.error-banner').count(), 0);
  await page.screenshot({ path: 'artifacts/production-admin.png', fullPage: true });
  await page.getByRole('button', { name: `${students[0].name} 전체 기록`, exact: true }).click();
  await page.getByRole('button', { name: '학생 화면으로 보기', exact: true }).click();
  await page.locator('.admin-view-banner').waitFor();
  await page.locator('.admin-view-banner').getByRole('button', { name: '관리자 화면', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '우리 반 용돈 한눈에' }).waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: 'Русский', exact: true }).click();
  await page.getByRole('heading', { name: 'Деньги нашего класса', exact: true }).waitFor();
  await page.getByRole('button', { name: `Все записи: ${students[0].name}`, exact: true }).click();
  await page.getByRole('heading', { name: `Дневник денег: ${students[0].name}`, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Все ученики', exact: true }).click();
  await page.getByRole('button', { name: 'За месяц', exact: true }).click();
  await page.getByLabel('Выбрать месяц', { exact: true }).fill('2026-09');
  assert.ok((await page.locator('.admin-summary-grid').innerText()).includes('Пришло за сентябрь'));
  await page.screenshot({ path: 'artifacts/production-ru-admin.png', fullPage: true });
  await page.getByRole('button', { name: '한국어', exact: true }).click();
  await page.locator('.account-button').click();
  await page.getByRole('button', { name: '로그아웃 · 다른 학생으로 들어가기', exact: true }).click();
  await page.getByLabel('학생 번호', { exact: true }).fill(students[0].number);
  await page.getByLabel('네 자리 비밀번호', { exact: true }).fill(students[0].password);
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 45000 });
  assert.ok((await page.locator('.account-button').innerText()).includes(students[0].name));
  await page.getByRole('navigation', { name: '모바일 메뉴' }).getByRole('button', { name: '기입장', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.ledger-table')?.textContent.includes('기록을 불러오고'));
  assert.equal(await page.locator('.error-banner').count(), 0);
  assert.equal(await page.locator('.admin-nav-item').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const koreanBalance = (await page.locator('.daily-total>b').innerText()).replace(/\D/g, '');
  await page.getByRole('button', { name: 'Русский', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
  assert.ok((await page.locator('.account-button').innerText()).includes(students[0].name));
  assert.equal((await page.locator('.daily-total>b').innerText()).replace(/\D/g, ''), koreanBalance);
  assert.ok((await page.locator('.daily-total>b').innerText()).includes('₩'));
  await page.screenshot({ path: 'artifacts/production-ru-diary.png', fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.balance-number').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'ru');
  assert.equal(await page.title(), 'Дневник денег');
  assert.deepEqual(errors, []);
  console.log('PASS: 공개 주소에서 한국어/러시아어 관리자 현황·전체 기록·월 통계·학생 화면·언어 및 로그인 유지·원화 잔액·모바일 표시.');
} finally {
  await browser.close();
  const paths = [];
  for (const [uid, { idToken, apiKey }] of temporaryUsers) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    assert.ok(response.ok, '확인용 익명 계정을 정리하지 못했습니다.');
    paths.push(`memberships/${uid}`, `admins/${uid}`);
  }
  if (paths.length) await googleRequest('https://firestore.googleapis.com/v1/projects/money-clover/databases/(default)/documents:commit', { method: 'POST', body: { writes: paths.map(path => ({ delete: `projects/money-clover/databases/(default)/documents/${path}` })) } });
  console.log('브라우저 확인용 로그인 세션 정리 완료. 학생 기록은 수정하지 않았습니다.');
}
