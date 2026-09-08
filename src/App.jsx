import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, BookOpen, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, CircleHelp, Download, House, Leaf, LogOut, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Wallet, X } from 'lucide-react';
import { connectAccount, restoreAccount, subscribeEntries, saveEntry, deleteEntry, logout, getMode, getLocalRosterInfo, changePassword } from './data.js';
import { formatDate, shiftDate, calculateLedger, summarizeDay } from './ledger.js';
import AdminDashboard, { AdminLogin } from './Admin.jsx';
import './admin.css';

const won = value => new Intl.NumberFormat('ko-KR').format(value);
const week = ['일', '월', '화', '수', '목', '금', '토'];
const parseDate = value => new Date(`${value}T12:00:00`);
const dateLabel = value => { const d = parseDate(value); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${week[d.getDay()]}요일`; };
const local = getMode() === 'local';

function Clover({ className = '', three = false }) {
  return <svg className={`clover ${className}`} viewBox="0 0 160 170" fill="none" aria-hidden="true"><path d="M83 83C85 119 76 138 62 155" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />{three ? <g fill="currentColor"><path d="M79 86C39 58 55 13 77 30C99 8 124 57 79 86Z"/><path d="M80 86C48 113 8 98 24 77C4 54 53 36 80 86Z"/><path d="M80 86C112 53 157 65 139 89C156 114 103 130 80 86Z"/></g> : <g fill="currentColor"><path d="M79 83C15 82 17 24 43 28C56 11 79 38 79 83Z"/><path d="M82 82C82 18 140 20 136 46C153 59 126 82 82 82Z"/><path d="M83 85C147 85 145 143 119 139C106 156 83 129 83 85Z"/><path d="M79 86C79 150 21 148 25 122C8 109 35 86 79 86Z"/></g>}</svg>;
}

function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const targets = () => [...ref.current.querySelectorAll('button, input, select, [tabindex="0"]')].filter(el => !el.disabled);
    targets()[0]?.focus();
    const key = e => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const elements = targets(), first = elements[0], last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={21}/></button></div>{children}</section></div>;
}

function EntryForm({ entry, date, account, onClose, onSaved }) {
  const [kind, setKind] = useState(entry?.kind || 'expense');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try { await saveEntry(account, { ...(entry || {}), date: form.get('date'), description: form.get('description').trim(), amount: Number(form.get('amount')), kind, createdAt: entry?.createdAt || Date.now() }); onSaved('용돈 기록을 저장했어요.'); }
    catch (err) { setError(err.message || '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  }
  return <Modal title={entry ? '기록 수정하기' : '용돈 기록하기'} onClose={() => !busy && onClose()}><p className="modal-description">작은 기록 하나가 좋은 습관이 돼요.</p><form onSubmit={submit}>
    <div className="kind-picker"><button type="button" className={kind === 'income' ? 'chosen income-choice' : ''} onClick={() => setKind('income')}><ArrowDownLeft size={18}/>들어온 돈</button><button type="button" className={kind === 'expense' ? 'chosen expense-choice' : ''} onClick={() => setKind('expense')}><ArrowUpRight size={18}/>나간 돈</button></div>
    <label className="field">날짜<input name="date" type="date" required defaultValue={entry?.date || date}/></label>
    <label className="field">내용<input name="description" placeholder="어디에 쓰거나, 어떻게 받았나요?" maxLength={60} required defaultValue={entry?.description || ''}/></label>
    <label className="field">금액<div className="amount-input"><input aria-label="금액" name="amount" type="number" inputMode="numeric" min="1" max="100000000" step="1" required placeholder="0" defaultValue={entry?.amount || ''}/><span>원</span></div></label>
    <p className="field-hint"><Sparkles size={14}/> 잔액은 알아서 계산해 드려요.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? '저장하는 중…' : entry ? '수정한 기록 저장' : '기록 저장하기'}<Check size={18}/></button>
  </form></Modal>;
}

function Login({ onLogin, onClose, roster, onAdminLogin }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(e.currentTarget);
    try { onLogin(await connectAccount(form.get('number'), form.get('pin'))); }
    catch (err) { setError(err.message || '번호와 비밀번호를 다시 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  return <Modal title="나의 용돈기입장에 들어가기" onClose={() => !busy && onClose()}><p className="modal-description">나만의 용돈 기록을 차곡차곡 쌓아 보세요.</p><form onSubmit={submit}><label className="field">학생 번호<input name="number" inputMode="numeric" autoComplete="username" placeholder="예: 01" required maxLength={20}/></label><label className="field">네 자리 비밀번호<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" placeholder="숫자 네 자리" pattern="[0-9]{4}" minLength={4} maxLength={4} required/></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? '들어가는 중…' : '시작하기'}<ArrowRight size={18}/></button></form>{local && !roster.available && <div className="demo-accounts"><span className="eyebrow">미리보기용 임시 명단</span><p>초록 클로버 <b>01 / 1234</b></p><p>행운 클로버 <b>02 / 2345</b></p><p>햇살 클로버 <b>03 / 3456</b></p><small>현재 기록은 이 브라우저에 저장돼요.</small></div>}{local && roster.available && <p className="roster-note">학생 {roster.count}명의 명단이 준비됐어요.<br/>선생님께 받은 번호와 비밀번호로 들어가세요.</p>}<p className="privacy-note"><ShieldCheck size={15}/>내 기록은 나와 선생님만 볼 수 있어요.</p><button className="admin-login-link" onClick={onAdminLogin}><ShieldCheck size={15}/>선생님 로그인</button></Modal>;
}

function PasswordForm({ account, onClose, onSaved }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    if (form.get('newPin') !== form.get('confirmPin')) { setError('새 비밀번호가 서로 달라요. 다시 확인해 주세요.'); return; }
    setBusy(true);
    try { await changePassword(account, form.get('currentPin'), form.get('newPin')); onSaved(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <Modal title="비밀번호 바꾸기" onClose={() => !busy && onClose()}><p className="modal-description">나만 기억할 수 있는 숫자 네 자리로 바꿔요.</p><form onSubmit={submit}>{[['currentPin', '현재 비밀번호'], ['newPin', '새 비밀번호'], ['confirmPin', '새 비밀번호 한 번 더']].map(([name, label]) => <label className="field" key={name}>{label}<input name={name} type="password" inputMode="numeric" autoComplete={name === 'currentPin' ? 'current-password' : 'new-password'} placeholder="숫자 네 자리" pattern="[0-9]{4}" minLength={4} maxLength={4} required/></label>)}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? '바꾸는 중…' : '새 비밀번호 저장'}<Check size={18}/></button></form><p className="privacy-note"><ShieldCheck size={15}/>다음 로그인부터 새 비밀번호를 사용해요.</p></Modal>;
}

export default function App() {
  const [account, setAccount] = useState(null), [entries, setEntries] = useState([]), [date, setDate] = useState(formatDate());
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [modal, setModal] = useState(null), [tab, setTab] = useState('home'), [toast, setToast] = useState(''), [busyDelete, setBusyDelete] = useState(false);
  const [roster, setRoster] = useState({ available: false, count: 0 });
  const [adminAccount, setAdminAccount] = useState(null);
  function returnToAdmin() { setAccount(null); setTab('admin'); setModal(null); }
  function openStudent(student) { setAccount({ id: student.id, nickname: student.name, adminView: true }); setDate(formatDate()); setTab('diary'); }
  const today = formatDate(), day = useMemo(() => summarizeDay(entries, date), [entries, date]);
  const ledger = useMemo(() => calculateLedger(entries), [entries]);
  const total = ledger.at(-1)?.balance || 0;
  const month = (tab === 'home' ? today : date).slice(0, 7), monthlyEntries = entries.filter(e => e.date.startsWith(month));
  const income = monthlyEntries.filter(e => e.kind === 'income').reduce((s, e) => s + e.amount, 0), expense = monthlyEntries.filter(e => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
  const recordDays = new Set(monthlyEntries.map(e => e.date)).size;
  useEffect(() => { let active = true; (async () => { try { const info = await getLocalRosterInfo(); if (active) setRoster(info); let saved = await restoreAccount(); if (!saved && local && !info.available && !sessionStorage.getItem('clover-signed-out')) saved = await connectAccount('01', '1234'); if (active) { if (saved?.role === 'admin') { setAdminAccount(saved); setTab('admin'); } else setAccount(saved); if (!saved) setModal('login'); } } catch (err) { if (active) setError(err.message); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, []);
  useEffect(() => { if (!account) { setEntries([]); return; } setLoading(true); return subscribeEntries(account, data => { setEntries(data); setLoading(false); setError(''); }, err => { setError(err.message || '기록을 불러오지 못했어요.'); setLoading(false); }); }, [account]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  function openEntry(entry) { if (!account) setModal('login'); else setModal({ type: 'entry', entry }); }
  function loggedIn(next) { setEntries([]); if (next.role === 'admin') { setAdminAccount(next); setAccount(null); setTab('admin'); } else { setAdminAccount(null); setAccount(next); if (tab === 'admin') setTab('home'); } setModal(null); sessionStorage.removeItem('clover-signed-out'); setToast(`${next.nickname}님, 반가워요!`); }
  async function signOut() { try { await logout(); sessionStorage.setItem('clover-signed-out', '1'); setAccount(null); setAdminAccount(null); setTab('home'); setModal('login'); } catch (err) { setToast(err.message); } }
  function exportCsv() {
    const escaped = value => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [['날짜', '내용', '들어온 돈', '나간 돈', '잔액'], ...ledger.map(e => [e.date, /^[=+@\-\t\r]/.test(e.description) ? `'${e.description}` : e.description, e.kind === 'income' ? e.amount : '', e.kind === 'expense' ? e.amount : '', e.balance])];
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escaped).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `용돈기입장_${today}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('전체 기록을 CSV로 내려받았어요.');
  }
  return <div className="app-shell">
    <aside className="sidebar"><a href="#" className="brand" onClick={e => { e.preventDefault(); setTab(adminAccount && !account ? 'admin' : 'home'); }}><span className="brand-icon"><Clover/></span><span>용돈기입장<small>차곡차곡, 나의 작은 습관</small></span></a><div className="sidebar-section-label">MY LITTLE HABIT</div><nav aria-label="주 메뉴" className={adminAccount && !account ? 'admin-overview-nav' : ''}>{adminAccount && <button className={`nav-item admin-nav-item ${tab === 'admin' ? 'active' : ''}`} onClick={returnToAdmin}><ShieldCheck size={20}/>관리자<span className="nav-dot"/></button>}<button className={tab === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('home')}><House size={20}/>홈<span className="nav-dot"/></button><button className={tab === 'diary' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('diary')}><BookOpen size={20}/>기입장<span className="nav-dot"/></button><button className={tab === 'stats' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('stats')}><ChartNoAxesCombined size={20}/>이번 달 돌아보기<span className="nav-dot"/></button></nav><div className="sidebar-bottom"><div className="little-note"><Clover three/><p>세 잎은 행복,<br/>네 잎은 행운.</p><span>작은 기록에서 둘 다 찾아요.</span></div><button className="help-button" onClick={() => setModal('help')}><CircleHelp size={18}/>이렇게 사용해요<ArrowUpRight size={16}/></button></div></aside>
    <div className="workspace"><header className="topbar"><div className="breadcrumb">나의 작은 경제 습관<span>/</span><b>{tab === 'admin' ? '관리자' : tab === 'home' ? '홈' : tab === 'diary' ? '기입장' : '이번 달 돌아보기'}</b></div><div className="account-actions">{local && <span className="preview-label"><span/>미리보기</span>}<button className="account-button" onClick={() => setModal(account || adminAccount ? 'account' : 'login')}><span className="avatar"><Clover/></span><span>{account?.nickname || adminAccount?.nickname || '로그인하기'}</span><ChevronRight size={14}/></button></div></header>
    <main className={`page-${tab}`}>{adminAccount && account?.adminView && <div className="admin-view-banner"><span><ShieldCheck size={16}/>{account.nickname} 학생의 기입장을 보고 있어요.</span><button onClick={returnToAdmin}>관리자 화면<ChevronRight size={14}/></button></div>}{tab === 'admin' ? <AdminDashboard onOpenStudent={openStudent}/> : <>{tab !== 'diary' && <section className="greeting"><div><div className="eyebrow">A LITTLE RECORD, A LITTLE GROWTH</div><h1>{tab === 'home' ? '차곡차곡, 나의 용돈' : '쑥쑥 자라는 나의 습관'}<span className="heading-spark">✳</span></h1><p>{tab === 'home' ? '오늘의 작은 기록이 내일의 나를 키워요.' : '한 달 동안 나의 돈이 어떻게 움직였는지 살펴봐요.'}</p></div><span className="today-label">{parseDate(today).getFullYear()}. {String(parseDate(today).getMonth() + 1).padStart(2, '0')}. {String(parseDate(today).getDate()).padStart(2, '0')}<span>{week[parseDate(today).getDay()]}요일</span></span></section>}
    {error && <div role="alert" className="error-banner">{error}<button onClick={() => window.location.reload()}>다시 불러오기</button></div>}
    {tab === 'home' && <><section className="overview"><div className="balance-card glass"><div className="balance-copy"><span className="card-label"><span className="small-icon"><Wallet size={17}/></span>지금 나에게 있는 돈</span><div className="balance-number">{won(total)}<span>원</span></div><span className="balance-caption"><span className="tiny-dot"/>모든 기록을 모아 계산한 잔액이에요</span></div><div className="clover-scene"><span className="spark one">✦</span><span className="spark two">✧</span><span className="scene-orbit"/><Clover className="hero-clover"/><Clover three className="small-clover"/><span className="scene-floor"/></div></div><div className="month-card glass"><div className="month-heading"><span>{Number(month.slice(5))}월의 용돈 흐름</span><span className="mini-pill">이번 달</span></div><div className="month-line"><span><span className="flow-icon in"><ArrowDownLeft size={17}/></span>들어온 돈</span><b className="income">+{won(income)}<small> 원</small></b></div><div className="month-line"><span><span className="flow-icon out"><ArrowUpRight size={17}/></span>나간 돈</span><b className="expense">−{won(expense)}<small> 원</small></b></div><div className="month-footer"><Leaf size={14}/><span>이번 달 <b>{recordDays}일</b> 기록했어요</span><span className="mini-leaves">✳ ✳ ✳</span></div></div></section><button className="home-diary-button" onClick={() => setTab('diary')}><BookOpen size={19}/><span>오늘의 용돈 기록하러 가기</span><ArrowRight size={18}/></button></>}
    {tab !== 'home' && <section className="records-section"><div className="section-heading"><div><h2>{tab === 'diary' ? date === today ? '오늘의 기록' : '이날의 기록' : '이번 달 돌아보기'}</h2><span>{tab === 'diary' ? '하나씩 적으며 나의 하루를 돌아봐요.' : `${Number(month.slice(5))}월에 쌓인 작은 기록들이에요.`}</span></div><button className="text-button" onClick={exportCsv} disabled={!entries.length}><Download size={15}/><span>기록 내려받기</span></button></div>
    <div className="records-card glass"><div className="date-toolbar"><div className="date-picker"><button className="icon-button" aria-label="이전 날짜" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={20}/></button><label className="date-control"><span>{dateLabel(date)}</span><input aria-label="기록 날짜 선택" type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)}/></label><button className="icon-button" aria-label="다음 날짜" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={20}/></button></div><button className={`today-button ${date === today ? 'selected' : ''}`} onClick={() => setDate(today)}>오늘</button></div>
    {tab === 'diary' ? <><div className="ledger-wrapper"><table className="ledger-table"><thead><tr><th>내용</th><th>들어온 돈</th><th>나간 돈</th><th>잔액</th></tr></thead><tbody>{loading ? <tr><td colSpan="4" className="empty-state">기록을 불러오고 있어요…</td></tr> : day.entries.length ? day.entries.map(entry => <tr key={entry.id}><td><button className="entry-name" onClick={() => openEntry(entry)} aria-label={`${entry.description} 수정`}><span className={`entry-icon ${entry.kind === 'income' ? 'in' : 'out'}`}>{entry.kind === 'income' ? <ArrowDownLeft size={19}/> : <ArrowUpRight size={19}/>}</span><span>{entry.description}</span><Pencil className="edit-hint" size={13}/></button></td><td className="income">{entry.kind === 'income' ? `+${won(entry.amount)}` : <span className="dash">—</span>}</td><td className="expense">{entry.kind === 'expense' ? `−${won(entry.amount)}` : <span className="dash">—</span>}</td><td><span>{won(entry.balance)}</span><button className="delete-entry" aria-label={`${entry.description} 삭제`} onClick={() => setModal({ type: 'delete', entry })}><Trash2 size={14}/></button></td></tr>) : <tr><td colSpan="4"><div className="empty-state"><span className="empty-clover"><Clover three/></span><b>아직 기록이 없어요</b><p>용돈을 받거나 썼다면, 첫 기록을 남겨 볼까요?</p></div></td></tr>}</tbody></table></div><div className="daily-total"><span>이날의 마무리 잔액<small>이전 날짜의 잔액도 포함해요</small></span><b>{won(day.closingBalance)}<small> 원</small></b></div><div className="add-record-wrap"><button className="add-record-button" onClick={() => openEntry(null)}><Plus size={20}/>기록 추가하기</button><span>받은 돈도, 쓴 돈도 잊기 전에 기록해요.</span></div></> : <div className="stats-content"><div className="stats-highlight"><Clover/><div><span>이번 달 남긴 돈</span><strong>{won(income - expense)}<small> 원</small></strong></div><span className="stat-count">총 {monthlyEntries.length}개의 기록</span></div><div className="chart-row"><span>들어온 돈</span><div className="bar-track"><div className="bar income-bar" style={{width: `${income / Math.max(income, expense, 1) * 100}%`}}/></div><b>{won(income)}원</b></div><div className="chart-row"><span>나간 돈</span><div className="bar-track"><div className="bar expense-bar" style={{width: `${expense / Math.max(income, expense, 1) * 100}%`}}/></div><b>{won(expense)}원</b></div><div className="habit-strip"><Leaf size={20}/><p>{recordDays ? `${recordDays}일 동안 기록했어요. 나의 소비를 알아가는 중이에요!` : '첫 기록을 남기고 나만의 용돈 습관을 시작해요.'}</p></div></div>}
    </div></section>}
    {tab !== 'diary' && <><div className="bottom-note"><span className="note-icon"><Clover three/></span><div><b>작은 기록이 모이면, 큰 습관이 돼요.</b><p>얼마를 썼는지 아는 것부터 똑똑한 용돈 관리의 시작이에요.</p></div><span className="note-spark">✧</span></div><footer><span><Clover/>나의 속도로, 차곡차곡.</span><span>MY MONEY DIARY</span></footer></>}
    </>}</main></div><nav className={`mobile-nav ${adminAccount && !account ? 'admin-overview-nav' : ''}`} aria-label="모바일 메뉴">{adminAccount && <button className={`admin-nav-item ${tab === 'admin' ? 'active' : ''}`} onClick={returnToAdmin}><ShieldCheck size={20}/>관리자</button>}<button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}><House size={20}/>홈</button><button className={tab === 'diary' ? 'active' : ''} onClick={() => setTab('diary')}><BookOpen size={20}/>기입장</button><button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}><ChartNoAxesCombined size={20}/>돌아보기</button><button className="help-nav-item" onClick={() => setModal('help')}><CircleHelp size={20}/>사용 방법</button></nav>
    {modal?.type === 'entry' && <EntryForm entry={modal.entry} date={date} account={account} onClose={() => setModal(null)} onSaved={message => { setModal(null); setToast(message); }}/>} {modal === 'login' && <Login roster={roster} onAdminLogin={() => setModal('admin-login')} onLogin={loggedIn} onClose={() => setModal(null)}/>}
    {modal === 'admin-login' && <Modal title="선생님 로그인" onClose={() => setModal('login')}><AdminLogin onLogin={loggedIn}/></Modal>}
    {modal === 'account' && <Modal title={adminAccount ? '관리자 계정' : '나의 용돈기입장'} onClose={() => setModal(null)}><div className="profile-summary"><span className="avatar large"><Clover/></span><h3>{adminAccount?.nickname || account?.nickname}</h3><p>나만의 용돈 습관을 키우고 있어요.</p></div><div className="info-note"><ShieldCheck size={20}/><span>{local ? '미리보기 기록은 현재 브라우저에 저장돼요. 학생마다 별도의 기입장을 사용해요.' : '내 기록은 나와 선생님만 볼 수 있어요. 다른 기기에서도 학생 번호와 비밀번호로 이어서 쓸 수 있어요.'}</span></div>{!adminAccount && <button className="password-button" onClick={() => setModal('password')}><ShieldCheck size={18}/>비밀번호 바꾸기<ChevronRight size={17}/></button>}{adminAccount && <button className="password-button" onClick={returnToAdmin}><ShieldCheck size={18}/>관리자 화면으로 돌아가기<ChevronRight size={17}/></button>}<button className="primary-button" onClick={signOut}>로그아웃 · 다른 학생으로 들어가기<LogOut size={18}/></button></Modal>}
    {modal === 'password' && <PasswordForm account={account} onClose={() => setModal('account')} onSaved={() => { setModal('account'); setToast('비밀번호를 바꿨어요. 다음부터 새 번호로 로그인해 주세요.'); }}/>} 
    {modal === 'help' && <Modal title="용돈기입장, 이렇게 사용해요" onClose={() => setModal(null)}><div className="help-step"><span>1</span><div><h3>나의 기입장에 들어와요</h3><p>학생 번호와 네 자리 비밀번호를 입력해요.</p></div></div><div className="help-step"><span>2</span><div><h3>날짜를 고르고 기록해요</h3><p>화살표로 날짜를 넘기거나 날짜를 눌러 달력에서 골라요. 아래 ‘기록 추가하기’를 눌러 내용을 적어요.</p></div></div><div className="help-step"><span>3</span><div><h3>잔액은 자동으로 계산돼요</h3><p>들어온 돈은 더하고, 나간 돈은 빼요. 지난 기록을 고치면 그 뒤의 잔액도 다시 계산돼요.</p></div></div><div className="info-note"><Pencil size={18}/><span>기록 내용을 누르면 수정할 수 있고, 휴지통 버튼으로 삭제할 수 있어요.</span></div><button className="primary-button" onClick={() => setModal(null)}>이제 시작해 볼게요<Leaf size={18}/></button></Modal>}
    {modal?.type === 'delete' && <Modal title="이 기록을 지울까요?" onClose={() => !busyDelete && setModal(null)}><p className="delete-description">‘{modal.entry.description}’ 기록을 삭제하면 잔액도 다시 계산돼요. 삭제한 기록은 되돌릴 수 없어요.</p><div className="confirm-actions"><button className="secondary-button" disabled={busyDelete} onClick={() => setModal(null)}>취소</button><button className="danger-button" disabled={busyDelete} onClick={async () => { setBusyDelete(true); try { await deleteEntry(account, modal.entry.id); setModal(null); setToast('기록을 삭제했어요.'); } catch (err) { setToast(err.message); } finally { setBusyDelete(false); } }}>{busyDelete ? '삭제 중…' : '삭제하기'}</button></div></Modal>}
    {toast && <div className="toast" role="status"><Check size={17}/>{toast}</div>}
  </div>;
}
