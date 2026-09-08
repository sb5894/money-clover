import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowDownLeft, ArrowUpRight, BookOpen, ChevronRight, Search, ShieldCheck, Users, Wallet } from 'lucide-react';
import { connectAdmin, subscribeStudents } from './admin-data.js';
import { calculateLedger, formatDate } from './ledger.js';

import { t, messageText, formatNumber as won, monthName, shortDate } from './i18n.jsx';
const totals = entries => entries.reduce((sum, entry) => ({ ...sum, [entry.kind]: sum[entry.kind] + entry.amount }), { income: 0, expense: 0 });

export function AdminLogin({ onLogin }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const pin = new FormData(event.currentTarget).get('adminPin');
    try { onLogin(await connectAdmin(pin)); }
    catch (err) { setError(err.message || t("관리자 비밀번호를 확인해 주세요.")); }
    finally { setBusy(false); }
  }
  return <><div className="admin-login-mark"><ShieldCheck size={30}/></div><p className="modal-description">{t("선생님 전용 화면에서 학생들의 용돈 기록을 살펴보세요.")}</p><form onSubmit={submit}><label className="field">{t("관리자 비밀번호")}<input name="adminPin" aria-label={t("관리자 비밀번호")} type="password" inputMode="numeric" autoComplete="current-password" minLength={4} maxLength={4} pattern="[0-9]{4}" required placeholder={t("숫자 네 자리")}/></label>{error && <p className="form-error" role="alert">{messageText(error)}</p>}<button className="primary-button" disabled={busy}>{busy ? t("확인하는 중…") : t("관리자 로그인")}<ArrowRight size={18}/></button></form><p className="privacy-note"><ShieldCheck size={15}/>{t("학생 비밀번호와 별도로 확인해요.")}</p></>;
}

export default function AdminDashboard({ onOpenStudent }) {
  const [students, setStudents] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null), [query, setQuery] = useState(''), [period, setPeriod] = useState('all'), [month, setMonth] = useState(formatDate().slice(0, 7));
  useEffect(() => subscribeStudents(values => { setStudents(values); setLoading(false); setError(''); }, err => { setError(err.message || t("학생 기록을 불러오지 못했어요.")); setLoading(false); }), []);
  const selected = students.find(student => student.id === selectedId);
  const summaries = useMemo(() => students.map(student => {
    const allEntries = student.entries || [];
    const entries = period === 'all' ? allEntries : allEntries.filter(entry => entry.date.startsWith(month));
    const sum = totals(entries);
    return { ...student, entries, ...sum, balance: calculateLedger(allEntries).at(-1)?.balance || 0 };
  }), [students, period, month]);
  const filtered = summaries.filter(student => student.name.includes(query.trim()) || student.id.split('-').at(-1).includes(query.trim()));
  const sum = summaries.reduce((value, student) => ({ income: value.income + student.income, expense: value.expense + student.expense }), { income: 0, expense: 0 });
  const selectedEntries = useMemo(() => calculateLedger(selected?.entries || []), [selected]);
  const selectedTotals = totals(selectedEntries);
  return <section className="admin-dashboard">
    <div className="admin-page-heading"><div><span className="eyebrow">{t("TEACHER'S DESK")}</span><h1>{selected ? t('{name}의 용돈기입장', { name: selected.name }) : t("우리 반 용돈 한눈에")}</h1><p>{selected ? t("처음부터 지금까지, 차곡차곡 쌓인 모든 기록이에요.") : t("학생들의 기록을 살펴보고 좋은 용돈 습관을 함께 키워요.")}</p></div><span className="admin-badge"><ShieldCheck size={14}/>{t("관리자")}</span></div>
    {error && <div className="error-banner" role="alert">{messageText(error)}</div>}
    {selected ? <><div className="admin-detail-toolbar"><button className="text-button" onClick={() => setSelectedId(null)}><ArrowLeft size={16}/>{t("전체 학생")}</button><button className="student-open-button" onClick={() => onOpenStudent(selected)}><BookOpen size={16}/>{t("학생 화면으로 보기")}<ArrowRight size={16}/></button></div><div className="admin-summary-grid"><div className="admin-summary-card glass"><span><ArrowDownLeft size={17}/>{t("전체 들어온 돈")}</span><strong className="income">{won(selectedTotals.income)}<small>{t("원")}</small></strong></div><div className="admin-summary-card glass"><span><ArrowUpRight size={17}/>{t("전체 나간 돈")}</span><strong className="expense">{won(selectedTotals.expense)}<small>{t("원")}</small></strong></div><div className="admin-summary-card glass"><span><Wallet size={17}/>{t("현재 잔액")}</span><strong>{won(selectedEntries.at(-1)?.balance || 0)}<small>{t("원")}</small></strong></div></div><div className="admin-table-card glass"><div className="admin-table-caption"><h2>{t("전체 기록")}</h2><span>{t('{count}개의 기록 · 날짜순', { count: selectedEntries.length })}</span></div><div className="admin-table-scroll"><table className="admin-history-table"><thead><tr><th>{t("날짜")}</th><th>{t("내용")}</th><th>{t("들어온 돈")}</th><th>{t("나간 돈")}</th><th>{t("잔액")}</th></tr></thead><tbody>{selectedEntries.length ? selectedEntries.map(entry => <tr key={entry.id}><td>{shortDate(entry.date)}</td><td>{entry.description}</td><td className="income">{entry.kind === 'income' ? `+${won(entry.amount)}` : '—'}</td><td className="expense">{entry.kind === 'expense' ? `−${won(entry.amount)}` : '—'}</td><td>{won(entry.balance)}</td></tr>) : <tr><td colSpan={5} className="admin-empty">{t("아직 작성한 기록이 없어요.")}</td></tr>}</tbody></table></div></div></> : <>
    <div className="admin-summary-grid"><div className="admin-summary-card glass"><span><Users size={17}/>{t("등록된 학생")}</span><strong>{students.length}<small>{t("명")}</small></strong></div><div className="admin-summary-card glass"><span><ArrowDownLeft size={17}/>{period === 'all' ? t('전체 들어온 돈') : t('{month}월 들어온 돈', { month: monthName(month) })}</span><strong className="income">{won(sum.income)}<small>{t("원")}</small></strong></div><div className="admin-summary-card glass"><span><ArrowUpRight size={17}/>{period === 'all' ? t('전체 나간 돈') : t('{month}월 나간 돈', { month: monthName(month) })}</span><strong className="expense">{won(sum.expense)}<small>{t("원")}</small></strong></div></div>
    <div className="admin-filters"><label className="admin-search"><Search size={17}/><input aria-label={t("학생 검색")} placeholder={t("이름 또는 번호 검색")} value={query} onChange={e => setQuery(e.target.value)}/></label><div className="admin-period"><button className={period === 'all' ? 'selected' : ''} onClick={() => setPeriod('all')}>{t("전체 기간")}</button><button className={period === 'month' ? 'selected' : ''} onClick={() => setPeriod('month')}>{t("월별")}</button>{period === 'month' && <input aria-label={t("통계 월 선택")} type="month" min="1900-01" max="2100-12" value={month} onChange={e => e.target.value && setMonth(e.target.value)}/>}</div></div>
    <div className="admin-table-card glass"><div className="admin-table-caption"><h2>{t("학생별 용돈 현황")}</h2><span>{t("이름을 누르면 전체 기록을 볼 수 있어요")}</span></div><table className="admin-students-table"><thead><tr><th>{t("학생")}</th><th>{t("들어온 돈")}</th><th>{t("나간 돈")}</th><th>{t("현재 잔액")}</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="admin-empty">{t("학생 기록을 불러오고 있어요…")}</td></tr> : filtered.length ? filtered.map(student => <tr key={student.id}><td><button onClick={() => setSelectedId(student.id)} aria-label={t('{name} 전체 기록', { name: student.name })}><span className="student-number">{student.id.split('-').at(-1)}</span><span>{student.name}</span><ChevronRight size={14}/></button></td><td className="income">{won(student.income)}</td><td className="expense">{won(student.expense)}</td><td>{won(student.balance)}</td></tr>) : <tr><td colSpan={4} className="admin-empty">{t("일치하는 학생이 없어요.")}</td></tr>}</tbody></table></div><p className="admin-footnote">{t("들어온 돈·나간 돈은 선택한 기간의 합계이며, 현재 잔액은 전체 기록을 기준으로 계산해요.")}</p></>}
  </section>;
}
