import React, { useSyncExternalStore } from 'react';
import ru from './locales/ru.json';

const storageKey = 'money-clover-language';
const listeners = new Set();
function initialLanguage() {
  const query = new URLSearchParams(window.location.search).get('lang');
  if (query === 'ko' || query === 'ru') return query;
  try { return localStorage.getItem(storageKey) === 'ru' ? 'ru' : 'ko'; } catch { return 'ko'; }
}
let language = initialLanguage();
const reverse = new Map(Object.entries(ru).map(([key, value]) => [value, key]));
export function t(key, params = {}) {
  const template = language === 'ru' ? (ru[key] ?? key) : key;
  return template.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match));
}
export function messageText(value) {
  if (value && typeof value === 'object' && value.key) {
    const localized = Object.fromEntries(Object.entries(value.localizedParams || {}).map(([name, key]) => [name, t(key)]));
    return t(value.key, { ...value.params, ...localized });
  }
  const message = typeof value === 'string' ? value : value?.message || '';
  if (!message) return '';
  if (ru[message]) return t(message);
  if (reverse.has(message)) return t(reverse.get(message));
  if (/permission-denied|unauthenticated|insufficient permissions/i.test(message)) return t('권한이 없어요. 다시 로그인해 주세요.');
  if (/network|unavailable|offline|fetch/i.test(message)) return t('연결을 확인하고 다시 시도해 주세요.');
  return language === 'ko' ? message : t('문제가 생겼어요. 다시 시도하거나 선생님께 알려 주세요.');
}
export const formatNumber = value => new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'ko-KR').format(value);
const parseDate = value => new Date(`${value}T12:00:00`);
export function monthName(month) {
  return language === 'ko' ? Number(month.slice(5, 7)) : new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(parseDate(`${month.slice(0, 7)}-01`));
}
export function dateLabel(value) {
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'ko-KR', { month: 'long', day: 'numeric', weekday: language === 'ru' ? 'short' : 'long' }).format(parseDate(value));
}
export function shortDate(value) {
  return new Intl.DateTimeFormat(language === 'ru' ? 'ru-RU' : 'ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(parseDate(value));
}
function synchronizeDocument() {
  document.documentElement.lang = language;
  document.title = t('용돈기입장');
  try { localStorage.setItem(storageKey, language); } catch { /* Private browsing may block storage. */ }
}
function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function useLanguage() { return useSyncExternalStore(subscribe, () => language); }
export function setLanguage(next) {
  if (!['ko', 'ru'].includes(next)) return;
  language = next;
  synchronizeDocument();
  const url = new URL(window.location.href);
  url.searchParams.set('lang', next);
  window.history.replaceState(null, '', url);
  document.querySelectorAll('input').forEach(input => input.setCustomValidity(''));
  listeners.forEach(listener => listener());
}
export function LanguageSwitch() {
  const selected = useLanguage();
  return <div className="language-switch" role="group" aria-label={t('언어 선택')}>
    <button type="button" lang="ko" aria-pressed={selected === 'ko'} onClick={() => setLanguage('ko')}>한국어</button>
    <button type="button" lang="ru" aria-pressed={selected === 'ru'} onClick={() => setLanguage('ru')}>Русский</button>
  </div>;
}
export function localizeValidation(event) {
  const input = event.target;
  input.setCustomValidity('');
  const validity = input.validity;
  let key = '이 칸을 채워 주세요.';
  if (!validity.valueMissing) {
    if (input.type === 'password') key = '숫자 네 자리를 입력해 주세요.';
    else if (input.type === 'date' || input.type === 'month') key = '날짜는 1900년부터 2100년까지 선택해 주세요.';
    else if (input.name === 'amount') {
      const integerMessage = t('금액은 1원부터 999,999,999원까지 정수로 입력해 주세요.');
      // Reuse the reviewed integer instruction with this form's stricter bound.
      input.setCustomValidity(integerMessage.replace(/999[\s,]999[\s,]999/, formatNumber(Number(input.max))));
      return;
    }
    else if (validity.tooLong) key = '내용은 60자까지 적을 수 있어요.';
  }
  input.setCustomValidity(t(key));
}
synchronizeDocument();
