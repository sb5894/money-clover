import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

// Credentials stay in the private local roster; do not log or attach them.
const students = parse(readFileSync(new URL('../../studentlist.csv', import.meta.url), 'utf8'), {
  bom: true, columns: true, skip_empty_lines: true, trim: true,
});
const translations = JSON.parse(readFileSync(new URL('../../docs/ru-translation-draft.json', import.meta.url), 'utf8'));
const ru = key => translations[key];
const nav = (page, name) => page.locator('nav:visible').getByRole('button', { name, exact: true });

async function language(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', name === 'Русский' ? 'ru' : 'ko');
}

async function loginRussian(page) {
  await page.getByLabel(ru('학생 번호'), { exact: true }).fill(students[0].number);
  await page.getByLabel(ru('네 자리 비밀번호'), { exact: true }).fill(students[0].password);
  await page.getByRole('button', { name: ru('시작하기'), exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.account-button')).toContainText(students[0].name);
}

async function addRussian(page, description, amount, kind = '들어온 돈') {
  await page.getByRole('button', { name: ru('기록 추가하기'), exact: true }).click();
  await page.getByRole('button', { name: ru(kind), exact: true }).click();
  await page.getByLabel(ru('내용'), { exact: true }).fill(description);
  await page.getByLabel(ru('금액'), { exact: true }).fill(String(amount));
  await page.getByRole('button', { name: ru('기록 저장하기'), exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function expectAmount(locator, amount, currency = true) {
  await expect.poll(async () => (await locator.innerText()).replace(/\s/g, '').replace(/,/g, '')).toBe(`${amount}${currency ? '₩' : ''}`);
}

async function noPageOverflow(page) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('Russian locale, unchanged student and record data, draft preservation, dates and ledger CRUD', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?lang=ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page).toHaveTitle(ru('용돈기입장'));
  await expect(page.getByRole('dialog')).toContainText(ru('네 자리 비밀번호'));
  await page.screenshot({ path: 'artifacts/ru-mobile-login.png', fullPage: true });
  await noPageOverflow(page);
  await loginRussian(page);
  await expect(page.locator('.overview')).toBeVisible();
  await expectAmount(page.locator('.balance-number'), 0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('.account-button')).toContainText(students[0].name);
  await nav(page, ru('기입장')).click();
  await page.getByLabel(ru('기록 날짜 선택'), { exact: true }).fill('2026-09-08');
  await expect(page.locator('.date-control')).toContainText('сентября');

  await page.getByRole('button', { name: ru('기록 추가하기'), exact: true }).click();
  await page.getByRole('button', { name: ru('들어온 돈'), exact: true }).click();
  const description = '할머니 용돈 / Подарок';
  await page.getByLabel(ru('내용'), { exact: true }).fill(description);
  await page.getByLabel(ru('금액'), { exact: true }).fill('10000');
  await language(page, '한국어');
  await expect(page.getByLabel('내용', { exact: true })).toHaveValue(description);
  await expect(page.getByLabel('금액', { exact: true })).toHaveValue('10000');
  await expect(page.getByLabel('날짜', { exact: true })).toHaveValue('2026-09-08');
  await language(page, 'Русский');
  await expect(page.getByLabel(ru('내용'), { exact: true })).toHaveValue(description);
  await expect(page.getByRole('button', { name: ru('들어온 돈'), exact: true })).toHaveClass(/chosen/);
  await page.getByRole('button', { name: ru('기록 저장하기'), exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectAmount(page.locator('.daily-total>b'), 10000);
  await addRussian(page, '간식 / Сок', 2500, '나간 돈');
  await expectAmount(page.locator('.daily-total>b'), 7500);
  await page.getByRole('button', { name: ru('이전 날짜'), exact: true }).click();
  await expect(page.getByLabel(ru('기록 날짜 선택'), { exact: true })).toHaveValue('2026-09-07');
  await addRussian(page, '어제 받은 돈', 500);
  await page.getByRole('button', { name: ru('다음 날짜'), exact: true }).click();
  await expectAmount(page.locator('.daily-total>b'), 8000);
  await page.getByRole('button', { name: 'Изменить: 간식 / Сок', exact: true }).click();
  await page.getByLabel(ru('금액'), { exact: true }).fill('3000');
  await page.getByRole('button', { name: ru('수정한 기록 저장'), exact: true }).click();
  await expectAmount(page.locator('.daily-total>b'), 7500);
  await page.getByRole('button', { name: 'Удалить: 간식 / Сок', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('нельзя будет вернуть');
  await page.getByRole('button', { name: ru('삭제하기'), exact: true }).click();
  await expectAmount(page.locator('.daily-total>b'), 10500);
  await language(page, '한국어');
  await expect(page.locator('.ledger-table')).toContainText(description);
  await expect(page.getByLabel('기록 날짜 선택', { exact: true })).toHaveValue('2026-09-08');
  await language(page, 'Русский');
  await expect(page.locator('.ledger-table')).toContainText(description);
  await expect(page.locator('body')).not.toContainText(/руб(?:ль|ля|лей)?|₽/i);
  await page.screenshot({ path: 'artifacts/ru-mobile-diary.png', fullPage: true });
  await noPageOverflow(page);
  await nav(page, ru('홈')).click();
  await expectAmount(page.locator('.balance-number'), 10500);
  await page.screenshot({ path: 'artifacts/ru-mobile-home.png', fullPage: true });
  await noPageOverflow(page);
  await language(page, '한국어');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('.account-button')).toContainText(students[0].name);
  expect(errors).toEqual([]);
});

test('Russian validation, help and password mismatch remain translated without changing a PIN', async ({ page }) => {
  await page.goto('/?lang=ru');
  await page.getByRole('button', { name: ru('시작하기'), exact: true }).click();
  await expect.poll(() => page.getByLabel(ru('학생 번호'), { exact: true }).evaluate(input => input.validationMessage)).toBe(ru('이 칸을 채워 주세요.'));
  await loginRussian(page);
  await nav(page, ru('기입장')).click();
  await page.getByRole('button', { name: ru('기록 추가하기'), exact: true }).click();
  await page.getByLabel(ru('내용'), { exact: true }).fill('Проверка');
  await page.getByLabel(ru('금액'), { exact: true }).fill('1.5');
  await page.getByRole('button', { name: ru('기록 저장하기'), exact: true }).click();
  await expect.poll(() => page.getByLabel(ru('금액'), { exact: true }).evaluate(input => input.validationMessage)).toContain('Пиши целое число, без дробей.');
  await page.getByRole('button', { name: ru('닫기'), exact: true }).click();
  await nav(page, ru('사용 방법')).click();
  await expect(page.getByRole('dialog')).toContainText(ru('학생 번호와 네 자리 비밀번호를 입력해요.'));
  await expect(page.getByRole('dialog')).toContainText('Приложение их прибавит');
  await noPageOverflow(page);
  await page.getByRole('button', { name: ru('이제 시작해 볼게요'), exact: true }).click();
  await page.locator('.account-button').click();
  await page.getByRole('button', { name: ru('비밀번호 바꾸기'), exact: true }).click();
  await page.getByLabel(ru('현재 비밀번호'), { exact: true }).fill(students[0].password);
  await page.getByLabel(ru('새 비밀번호'), { exact: true }).fill('0123');
  await page.getByLabel(ru('새 비밀번호 한 번 더'), { exact: true }).fill('9876');
  await page.getByRole('button', { name: ru('새 비밀번호 저장'), exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(ru('새 비밀번호가 서로 달라요. 다시 확인해 주세요.'));
  await language(page, '한국어');
  await expect(page.getByRole('alert')).toContainText('새 비밀번호가 서로 달라요.');
  await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveValue('0123');
  await language(page, 'Русский');
  await expect(page.getByRole('alert')).toContainText('В двух полях разные пароли.');
  await page.getByRole('button', { name: ru('닫기'), exact: true }).click();
});

test('Russian teacher totals, month selector, full history and student view', async ({ page }) => {
  test.skip(!process.env.CLOVER_ADMIN_PIN, 'Local teacher verification requires CLOVER_ADMIN_PIN.');
  await page.goto('/?lang=ru');
  await loginRussian(page);
  await nav(page, ru('기입장')).click();
  await addRussian(page, 'Учитель проверяет / 용돈', 3000);
  await addRussian(page, 'Учитель проверяет / 간식', 1200, '나간 돈');
  await page.locator('.account-button').click();
  await page.getByRole('button', { name: ru('로그아웃 · 다른 학생으로 들어가기'), exact: true }).click();
  await page.getByRole('button', { name: ru('선생님 로그인'), exact: true }).click();
  await page.getByLabel(ru('관리자 비밀번호'), { exact: true }).fill(process.env.CLOVER_ADMIN_PIN);
  await page.getByRole('button', { name: ru('관리자 로그인'), exact: true }).click();
  await expect(page.getByRole('heading', { name: ru('우리 반 용돈 한눈에'), exact: true })).toBeVisible();
  await expect(page.locator('.admin-students-table tbody tr')).toHaveCount(students.length);
  await page.screenshot({ path: 'artifacts/ru-mobile-admin.png', fullPage: true });
  await page.getByRole('button', { name: ru('월별'), exact: true }).click();
  await expect(page.getByLabel(ru('통계 월 선택'), { exact: true })).toBeVisible();
  await page.getByLabel(ru('통계 월 선택'), { exact: true }).fill('2026-09');
  await expect(page.locator('.admin-summary-grid')).toContainText('Пришло за сентябрь');
  await page.getByRole('button', { name: ru('전체 기간'), exact: true }).click();
  await noPageOverflow(page);
  await page.getByRole('button', { name: `Все записи: ${students[0].name}`, exact: true }).click();
  await expect(page.locator('.admin-history-table tbody tr')).toHaveCount(2);
  await expect(page.locator('.admin-history-table')).toContainText('Учитель проверяет / 용돈');
  await noPageOverflow(page);
  await page.getByRole('button', { name: ru('학생 화면으로 보기'), exact: true }).click();
  await expect(page.locator('.admin-view-banner')).toContainText(students[0].name);
  await expectAmount(page.locator('.daily-total>b'), 1800);
  await language(page, '한국어');
  await expect(page.locator('.admin-view-banner')).toContainText(students[0].name);
  await language(page, 'Русский');
  await page.locator('.admin-view-banner').getByRole('button', { name: ru('관리자 화면'), exact: true }).click();
  await expect(page.getByRole('heading', { name: ru('우리 반 용돈 한눈에'), exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: ru('우리 반 용돈 한눈에'), exact: true })).toBeVisible();
});
