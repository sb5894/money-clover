export function formatDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return formatDate(value);
}

export function validateEntry(entry) {
  const description = String(entry.description ?? '').trim();
  const date = String(entry.date ?? '');
  const parsed = new Date(`${date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || formatDate(parsed) !== date || date < '1900-01-01' || date > '2100-12-31') {
    throw new Error('올바른 날짜를 선택해 주세요.');
  }
  if (!description || description.length > 80) throw new Error('내용은 1~80자로 적어 주세요.');
  if (!['income', 'expense'].includes(entry.kind)) throw new Error('들어온 돈인지 나간 돈인지 선택해 주세요.');
  const amount = typeof entry.amount === 'string' && /^\d+$/.test(entry.amount) ? Number(entry.amount) : entry.amount;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 999999999) throw new Error('금액은 1원부터 999,999,999원까지 정수로 입력해 주세요.');
  return { ...entry, date, description, amount, kind: entry.kind };
}

export function calculateLedger(entries) {
  let balance = 0;
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map(entry => {
    balance += entry.kind === 'income' ? entry.amount : -entry.amount;
    return { ...entry, balance };
  });
}

export function summarizeDay(entries, date) {
  const ledger = calculateLedger(entries);
  const rows = ledger.filter(entry => entry.date === date);
  const previous = ledger.filter(entry => entry.date < date);
  const openingBalance = previous.at(-1)?.balance ?? 0;
  return {
    entries: rows,
    income: rows.filter(entry => entry.kind === 'income').reduce((total, entry) => total + entry.amount, 0),
    expense: rows.filter(entry => entry.kind === 'expense').reduce((total, entry) => total + entry.amount, 0),
    openingBalance,
    closingBalance: rows.at(-1)?.balance ?? openingBalance,
    totalBalance: ledger.at(-1)?.balance ?? 0,
  };
}
