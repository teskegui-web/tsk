import type { Expense } from './expense-store';
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDueDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match.map(Number);
  if (year < 2000 || year > 2100) return null;
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return localDateKey(date);
}
export function payableSummary(expenses: Expense[], today = localDateKey(new Date())) {
  const items = expenses.filter(item => item.status === 'scheduled' && item.kind !== 'income')
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.createdAt.localeCompare(b.createdAt));
  return { items, total: items.reduce((sum, item) => sum + item.cents, 0), overdue: items.filter(item => item.dueDate && item.dueDate < today).reduce((sum, item) => sum + item.cents, 0) };
}

export const maxPaymentMonths = 120;
export type PaymentSchedule = { mode: 'monthly'; additionalMonths: number } | { mode: 'installments'; total: number; alreadyPaid: number };
export type PaymentSeries = { id: string; mode: 'monthly' } | {
  id: string; mode: 'installments'; number: number; total: number; alreadyPaid: number;
};

export function schedulePayable(item: Expense, schedule: PaymentSchedule): Expense[] {
  if (item.status !== 'scheduled' || item.kind === 'income' || item.paymentSeries || !item.dueDate ||
      parseDueDate(item.dueDate.split('-').reverse().join('/')) !== item.dueDate) {
    throw new Error('Selecione uma conta pendente avulsa com vencimento válido.');
  }

  const total = schedule.mode === 'installments' ? schedule.total : schedule.additionalMonths + 1;
  const alreadyPaid = schedule.mode === 'installments' ? schedule.alreadyPaid : 0;
  const limit = schedule.mode === 'installments' ? maxPaymentMonths : maxPaymentMonths + 1;
  if (!Number.isInteger(total) || total < 2 || total > limit ||
      !Number.isInteger(alreadyPaid) || alreadyPaid < 0 || alreadyPaid >= total) {
    throw new Error('Confira a quantidade de meses ou parcelas. O carnê precisa ter pelo menos uma parcela em aberto.');
  }

  const count = total - alreadyPaid;
  const [year, month, day] = item.dueDate.split('-').map(Number);
  return Array.from({ length: count }, (_, offset) => {
    const monthStart = new Date(year, month - 1 + offset, 1, 12);
    if (monthStart.getFullYear() > 2100) throw new Error('As datas da série devem ir até o ano de 2100.');
    const lastDay = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12).getDate();
    monthStart.setDate(Math.min(day, lastDay));
    return {
      ...item,
      paidAt: undefined,
      id: offset === 0 ? item.id : item.id + '-monthly-' + offset,
      dueDate: localDateKey(monthStart),
      paymentSeries: schedule.mode === 'monthly' ? { id: item.id, mode: 'monthly' } :
        { id: item.id, mode: 'installments', number: alreadyPaid + offset + 1, total, alreadyPaid },
    };
  });
}

export function installmentProgress(expenses: Expense[]) {
  const counts = new Map<string, { paid: number; remaining: number }>();
  for (const item of expenses) {
    const series = item.paymentSeries;
    if (series?.mode !== 'installments') continue;
    const progress = counts.get(series.id) ?? { paid: series.alreadyPaid, remaining: 0 };
    if (item.status === 'paid') progress.paid++;
    if (item.status === 'scheduled') progress.remaining++;
    counts.set(series.id, progress);
  }
  return counts;
}

export function groupPaymentEntries(expenses: Expense[]) {
  const groups = new Map<string, Expense[]>();
  for (const item of expenses) {
    const key = item.paymentSeries ? 'series:' + item.paymentSeries.id : 'entry:' + item.id;
    const entries = groups.get(key);
    if (entries) entries.push(item);
    else groups.set(key, [item]);
  }
  return [...groups].map(([key, entries]) => ({
    key,
    entries: entries.length > 1 ? entries.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')) : entries,
  }));
}

export function paymentGroupLabel(item: Expense, progress: ReturnType<typeof installmentProgress>, entries: Expense[]) {
  const series = item.paymentSeries;
  if (series?.mode === 'installments') {
    const counts = progress.get(series.id);
    if (counts) return counts.paid + ' de ' + series.total + ' parcelas pagas · ' + counts.remaining + ' em aberto';
  }
  const paid = entries.filter(entry => entry.status === 'paid').length;
  return paid + ' ' + (paid === 1 ? 'pago' : 'pagos') + ' · ' + (entries.length - paid) + ' em aberto';
}

