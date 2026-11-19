import type { Expense } from './expense-store';

export type ReportScope = 'Todos' | 'Pessoal' | 'Familiar';
export function monthDate(year: number, month: number, offset = 0) {
  return new Date(year, month + offset, 1, 12);
}
export function summarizeMonth(expenses: Expense[], year: number, month: number, scope: ReportScope, kind: 'expense' | 'income' = 'expense') {
  const target = monthDate(year, month);
  const rows = expenses.filter(item => {
    const date = new Date(item.paidAt ?? item.createdAt);
    return item.status !== 'scheduled' && (item.kind ?? 'expense') === kind && Number.isSafeInteger(item.cents) && item.cents > 0 &&
      date.getFullYear() === target.getFullYear() && date.getMonth() === target.getMonth() &&
      (scope === 'Todos' || item.scope === scope);
  });
  const total = rows.reduce((sum, item) => sum + item.cents, 0);
  const buckets = new Map<string, { cents: number; count: number }>();
  for (const item of rows) {
    const category = item.category || 'Outros';
    const bucket = buckets.get(category) || { cents: 0, count: 0 };
    bucket.cents += item.cents; bucket.count++;
    buckets.set(category, bucket);
  }
  const categories = [...buckets.entries()].map(([name, value]) => ({ name, ...value, share: total ? value.cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, 'pt-BR'));
  return { total, count: rows.length, average: rows.length ? Math.round(total / rows.length) : 0, categories };
}
export function buildReport(expenses: Expense[], year: number, month: number, scope: ReportScope, memberId?: string) {
  if (memberId) expenses = expenses.filter(item => memberId === 'unassigned' ? !item.memberId : item.memberId === memberId);
  const selected = summarizeMonth(expenses, year, month, scope);
  const income = summarizeMonth(expenses, year, month, scope, 'income');
  const pending = expenses.filter(item => item.status === 'scheduled' && item.kind !== 'income' &&
    item.dueDate?.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`) && (scope === 'Todos' || item.scope === scope));
  const pendingTotal = pending.reduce((sum, item) => sum + item.cents, 0);
  const previousDate = monthDate(year, month, -1);
  const previous = summarizeMonth(expenses, previousDate.getFullYear(), previousDate.getMonth(), scope);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const date = monthDate(year, month, index - 5);
    const spending = summarizeMonth(expenses, date.getFullYear(), date.getMonth(), scope);
    const earnings = summarizeMonth(expenses, date.getFullYear(), date.getMonth(), scope, 'income');
    return { date, ...spending, income: earnings.total, balance: earnings.total - spending.total };
  });
  return { ...selected, income, pendingTotal, pendingCount: pending.length, projectedBalance: income.total - selected.total - pendingTotal, balance: income.total - selected.total, previousTotal: previous.total, difference: selected.total - previous.total,
    changePercent: previous.total ? (selected.total - previous.total) / previous.total * 100 : null, trend };
}
