import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, monthDate } from '../src/services/reports.ts';
import { parseDueDate, payableSummary } from '../src/services/payables.ts';

const expense = (year, month, cents, category = 'Combustível', scope = 'Familiar', day = 10) => ({ id: `${year}-${month}-${cents}`, description: category, cents, category, scope, createdAt: new Date(year, month, day, 12).toISOString() });
test('agrupa centavos, percentuais e filtros sem incluir outro mês', () => {
  const data = [expense(2026, 10, 1000), expense(2026, 10, 500, 'Alimentação', 'Pessoal'), expense(2026, 9, 3000)];
  const report = buildReport(data, 2026, 10, 'Todos');
  assert.equal(report.total, 1500); assert.equal(report.count, 2); assert.equal(report.average, 750);
  assert.equal(report.categories[0].name, 'Combustível'); assert.equal(report.categories[0].share, 2 / 3);
  assert.equal(report.previousTotal, 3000); assert.equal(report.changePercent, -50);
  assert.equal(buildReport(data, 2026, 10, 'Pessoal').total, 500);
  assert.equal(buildReport(data, 2026, 10, 'Familiar').total, 1000);
});
test('pendentes não afetam saldo realizado e pagamento entra no mês correto', () => {
  const pending = { ...expense(2026, 10, 10000), id: 'bill', status: 'scheduled', dueDate: '2026-12-10' };
  const november = buildReport([pending], 2026, 10, 'Todos');
  assert.equal(november.total, 0); assert.equal(november.balance, 0); assert.equal(november.pendingTotal, 0);
  const december = buildReport([pending], 2026, 11, 'Todos');
  assert.equal(december.pendingTotal, 10000); assert.equal(december.projectedBalance, -10000);
  assert.equal(buildReport([pending], 2026, 11, 'Pessoal').pendingTotal, 0);
  const paid = { ...pending, status: 'paid', paidAt: new Date(2026, 11, 10, 12).toISOString() };
  assert.equal(buildReport([paid], 2026, 10, 'Todos').total, 0);
  assert.equal(buildReport([paid], 2026, 11, 'Todos').total, 10000);
  assert.equal(buildReport([paid], 2026, 11, 'Todos').pendingTotal, 0);
});
test('valida calendário real e separa vencidas, hoje e futuras sem conversão UTC', () => {
  assert.equal(parseDueDate('29/02/2028'), '2028-02-29');
  for (const value of ['29/02/2026', '31/11/2026', '00/12/2026', '1/1/2026', '01/13/2026']) assert.equal(parseDueDate(value), null);
  const bill = { ...expense(2026, 10, 10000), status: 'scheduled', dueDate: '2026-11-14' };
  const summary = payableSummary([bill, { ...bill, id: 'today', dueDate: '2026-11-15' }, { ...bill, id: 'future', dueDate: '2026-12-01' }, { ...bill, id: 'paid', status: 'paid' }], '2026-11-15');
  assert.equal(summary.total, 30000); assert.equal(summary.overdue, 10000);
  assert.equal(summary.items[0].dueDate, '2026-11-14');
});
test('trata meses vazios, virada de ano e data local', () => {
  const empty = buildReport([], 2026, 0, 'Todos');
  assert.equal(empty.average, 0); assert.equal(empty.changePercent, null); assert.equal(empty.categories.length, 0);
  assert.equal(empty.trend[0].date.getFullYear(), 2025); assert.equal(empty.trend[0].date.getMonth(), 7);
  const data = [expense(2025, 11, 100), expense(2026, 0, 300, 'Moradia', 'Familiar', 1), { ...expense(2026, 0, 1), createdAt: 'inválida' }];
  const report = buildReport(data, 2026, 0, 'Todos');
  assert.equal(report.total, 300); assert.equal(report.changePercent, 200); assert.equal(report.trend.at(-1).total, 300);
  assert.equal(monthDate(2026, 0, -1).getMonth(), 11);
});
test('separa receitas, benefícios e despesas antigas e calcula saldo por filtro', () => {
  const data = [
    expense(2026, 10, 10000),
    { ...expense(2026, 10, 300000, 'Salário', 'Pessoal'), kind: 'income' },
    { ...expense(2026, 10, 80000, 'Vale-alimentação'), kind: 'income' },
    { ...expense(2026, 10, 50000, 'Freelance', 'Pessoal'), kind: 'income' },
  ];
  const report = buildReport(data, 2026, 10, 'Todos');
  assert.equal(report.total, 10000);
  assert.equal(report.count, 1);
  assert.equal(report.income.total, 430000);
  assert.equal(report.income.count, 3);
  assert.equal(report.balance, 420000);
  assert.equal(report.income.categories[0].name, 'Salário');
  assert.equal(report.trend.at(-1).income, 430000);
  assert.equal(buildReport(data, 2026, 10, 'Familiar').balance, 70000);
  assert.equal(buildReport(data, 2026, 10, 'Pessoal').income.total, 350000);
  assert.equal(buildReport([expense(2026, 10, 10000)], 2026, 10, 'Todos').balance, -10000);
});
test('filtra pessoa em despesas, receitas, projeções e histórico sem misturar Geral', () => {
  const data = [
    { ...expense(2026, 10, 5000, 'Escola'), memberId: 'gabriel' },
    { ...expense(2026, 10, 3000, 'Balé'), memberId: 'maria' },
    { ...expense(2026, 10, 1000, 'Freelance'), kind: 'income', memberId: 'gabriel' },
    { ...expense(2026, 10, 2000), memberId: 'gabriel', status: 'scheduled', dueDate: '2026-11-20' },
    expense(2026, 10, 9000),
  ];
  const report = buildReport(data, 2026, 10, 'Todos', 'gabriel');
  assert.equal(report.total, 5000); assert.equal(report.income.total, 1000);
  assert.equal(report.pendingTotal, 2000); assert.equal(report.projectedBalance, -6000);
  assert.equal(report.trend.at(-1).total, 5000);
  assert.equal(buildReport(data, 2026, 10, 'Todos', 'unassigned').total, 9000);
  assert.equal(buildReport(data, 2026, 10, 'Todos', 'maria').total, 3000);
});
