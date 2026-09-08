import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const students = parse(readFileSync(new URL('../../studentlist.csv', import.meta.url), 'utf8'), { bom: true, columns: true, skip_empty_lines: true, trim: true });
async function login(page, index = 0) {
  await page.getByLabel('학생 번호', { exact: true }).fill(students[index].number);
  await page.getByLabel('네 자리 비밀번호', { exact: true }).fill(students[index].password);
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.account-button')).toContainText(students[index].name);
}
async function add(page, description, amount, kind, date) {
  await page.getByRole('button', { name: '기록 추가하기', exact: true }).click();
  await page.getByRole('button', { name: kind, exact: true }).click();
  await page.getByLabel('내용', { exact: true }).fill(description);
  await page.getByLabel('금액', { exact: true }).fill(String(amount));
  if (date) await page.getByLabel('날짜', { exact: true }).fill(date);
  await page.getByRole('button', { name: '기록 저장하기', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('mobile roster login, records, backdated balance, edit/delete and account separation', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('학생 22명의 명단이 준비됐어요.')).toBeVisible();
  await login(page);
  await expect(page).toHaveTitle('용돈기입장');
  await expect(page.locator('.overview')).toBeVisible();
  await expect(page.locator('.records-section')).toHaveCount(0);
  await page.getByRole('navigation', { name: '모바일 메뉴' }).getByRole('button', { name: '기입장', exact: true }).click();
  await expect(page.locator('.overview')).toHaveCount(0);
  await expect(page.locator('.greeting')).toHaveCount(0);
  await expect(page.getByText('아직 기록이 없어요')).toBeVisible();
  await add(page, '이번 주 용돈', 10000, '들어온 돈');
  await add(page, '친구와 먹은 간식', 2500, '나간 돈');
  await add(page, '새로 산 지우개', 1000, '나간 돈');
  await expect(page.locator('.daily-total>b')).toHaveText('6,500 원');
  await page.getByRole('button', { name: '이전 날짜', exact: true }).click();
  await add(page, '차곡차곡 모은 용돈', 12000, '들어온 돈');
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(page.locator('.daily-total>b')).toHaveText('18,500 원');
  await expect(page.locator('.ledger-table tbody tr').first()).toContainText('22,000');
  await page.screenshot({ path: 'artifacts/mobile-diary.png', fullPage: true });
  await page.getByRole('button', { name: '새로 산 지우개 수정', exact: true }).click();
  await page.getByLabel('금액', { exact: true }).fill('1500');
  await page.getByRole('button', { name: '수정한 기록 저장', exact: true }).click();
  await expect(page.locator('.daily-total>b')).toHaveText('18,000 원');
  await page.reload();
  await expect(page.locator('.balance-number')).toHaveText('18,000원');
  await page.getByRole('navigation', { name: '모바일 메뉴' }).getByRole('button', { name: '기입장', exact: true }).click();
  await expect(page.locator('.daily-total>b')).toHaveText('18,000 원');
  await page.getByRole('button', { name: '새로 산 지우개 삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제하기', exact: true }).click();
  await expect(page.locator('.daily-total>b')).toHaveText('19,500 원');
  await page.getByRole('navigation', { name: '모바일 메뉴' }).getByRole('button', { name: '홈', exact: true }).click();
  await expect(page.locator('.balance-number')).toHaveText('19,500원');
  await expect(page.locator('.records-section')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/mobile-home.png', fullPage: true });
  await page.getByRole('navigation', { name: '모바일 메뉴' }).getByRole('button', { name: '돌아보기', exact: true }).click();
  await expect(page.locator('.stats-highlight strong')).toHaveText('19,500 원');
  await page.getByRole('navigation', { name: '모바일 메뉴' }).getByRole('button', { name: '기입장', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '기록 내려받기', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'artifacts/desktop-diary.png', fullPage: true });
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator('.account-button').click();
  await page.getByRole('button', { name: '비밀번호 바꾸기', exact: true }).click();
  await page.getByLabel('현재 비밀번호', { exact: true }).fill(students[0].password);
  await page.getByLabel('새 비밀번호', { exact: true }).fill('0123');
  await page.getByLabel('새 비밀번호 한 번 더', { exact: true }).fill('9876');
  await page.getByRole('button', { name: '새 비밀번호 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('서로 달라요');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃 · 다른 학생으로 들어가기', exact: true }).click();
  await login(page, 1);
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '기입장', exact: true }).click();
  await expect(page.locator('.daily-total>b')).toHaveText('0 원');
  await expect(page.getByText('아직 기록이 없어요')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('CSV stays private and login opens on narrow mobile screen', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const path of ['/studentlist.csv', '/studentlist.csv?raw', '/.private/pin-overrides.json']) {
    expect((await request.get(path)).status()).toBe(403);
  }
  await page.screenshot({ path: 'artifacts/mobile-login.png', fullPage: true });
});

test('admin totals, full history, student view and restored admin login', async ({ page }) => {
  test.skip(!process.env.CLOVER_ADMIN_PIN, '관리자 검증 비밀번호 환경 변수가 필요합니다.');
  await page.goto('/');
  await login(page);
  await page.getByRole('navigation', { name: '모바일 메뉴' }).getByRole('button', { name: '기입장', exact: true }).click();
  await add(page, '관리자 확인용 용돈', 3000, '들어온 돈');
  await add(page, '관리자 확인용 간식', 1200, '나간 돈');
  await page.locator('.account-button').click();
  await page.getByRole('button', { name: '로그아웃 · 다른 학생으로 들어가기', exact: true }).click();
  await page.getByRole('button', { name: '선생님 로그인', exact: true }).click();
  await page.getByLabel('관리자 비밀번호', { exact: true }).fill(process.env.CLOVER_ADMIN_PIN);
  await page.getByRole('button', { name: '관리자 로그인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '우리 반 용돈 한눈에' })).toBeVisible();
  await expect(page.locator('.admin-students-table tbody tr')).toHaveCount(students.length);
  const first = page.locator('.admin-students-table tbody tr').filter({ hasText: students[0].name });
  await expect(first).toContainText('3,000');
  await expect(first).toContainText('1,200');
  await expect(first).toContainText('1,800');
  await page.screenshot({ path: 'artifacts/mobile-admin.png', fullPage: true });
  await page.getByRole('button', { name: `${students[0].name} 전체 기록`, exact: true }).click();
  await expect(page.locator('.admin-history-table tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: '학생 화면으로 보기', exact: true }).click();
  await expect(page.locator('.admin-view-banner')).toContainText(students[0].name);
  await expect(page.locator('.daily-total>b')).toHaveText('1,800 원');
  await add(page, '선생님 화면 기록 확인', 200, '들어온 돈');
  await page.locator('.admin-view-banner').getByRole('button', { name: '관리자 화면', exact: true }).click();
  await expect(page.locator('.admin-students-table tbody tr').filter({ hasText: students[0].name })).toContainText('2,000');
  await page.reload();
  await expect(page.getByRole('heading', { name: '우리 반 용돈 한눈에' })).toBeVisible();
  await page.getByLabel('학생 검색', { exact: true }).fill(students[1].name);
  await expect(page.locator('.admin-students-table tbody tr')).toHaveCount(1);
  await page.getByLabel('학생 검색', { exact: true }).fill('');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'artifacts/desktop-admin.png', fullPage: true });
});
