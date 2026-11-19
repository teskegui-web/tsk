import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { extractWakeCommand } from '../src/services/wake-command.ts';

test('ignora conversa ambiente e captura comando na mesma frase ou após ativação', () => {
  assert.equal(extractWakeCommand('gastei dez reais em gasolina', 0, 100).text, '');
  assert.equal(extractWakeCommand('Agente, gastei dez reais em gasolina', 0, 100).text, 'gastei dez reais em gasolina');
  const armed = extractWakeCommand('Agente', 0, 100);
  assert.equal(extractWakeCommand('dez reais em gasolina', armed.armedUntil, 200).text, 'dez reais em gasolina');
  assert.equal(extractWakeCommand('dez reais em gasolina', armed.armedUntil, 9000).text, '');
});

test('salva antes de confirmar, deduplica Siri e preserva exclusão ao receber comando repetido', async () => {
  let saved = null;
  let fail = false;
  mock.module('@react-native-async-storage/async-storage', { defaultExport: {
    getItem: async () => saved,
    setItem: async (_, value) => { if (fail) throw new Error('disco indisponível'); saved = value; },
  } });
  const { addExpense, deleteExpense, loadExpenses, payExpense, replicatePayable, saveMember, saveCategory, archiveRegistration } = await import('../src/services/expense-store.ts');
  const expense = { id: 'siri-1', description: 'Gasolina', cents: 1000, category: 'Combustível', scope: 'Familiar', createdAt: new Date().toISOString() };
  await Promise.all([addExpense(expense, 'siri-1'), addExpense(expense, 'siri-1')]);
  assert.equal((await loadExpenses()).expenses.length, 1);
  await deleteExpense(expense.id);
  await addExpense(expense, 'siri-1');
  assert.equal((await loadExpenses()).expenses.length, 0);
  fail = true;
  await assert.rejects(addExpense({ ...expense, id: 'new' }, 'new'));
  assert.equal((await loadExpenses()).commands.includes('new'), false);
  fail = false;
  await addExpense({ ...expense, id: 'new' }, 'new');
  assert.equal((await loadExpenses()).expenses.length, 1);
  const income = { ...expense, id: 'income', kind: 'income', category: 'Salário', cents: 300000 };
  await addExpense(income);
  assert.equal((await loadExpenses()).expenses.find(item => item.id === 'income').kind, 'income');
  await deleteExpense('income');
  assert.equal((await loadExpenses()).expenses.some(item => item.id === 'income'), false);
  const payable = { ...expense, id: 'bill', status: 'scheduled', dueDate: '2026-12-10' };
  await addExpense(payable);
  fail = true;
  await assert.rejects(payExpense('bill', '2026-12-10T15:00:00.000Z'));
  assert.equal((await loadExpenses()).expenses.find(item => item.id === 'bill').status, 'scheduled');
  fail = false;
  await Promise.all([payExpense('bill', '2026-12-10T15:00:00.000Z'), payExpense('bill', '2026-12-11T15:00:00.000Z')]);
  const paid = (await loadExpenses()).expenses.filter(item => item.id === 'bill');
  assert.equal(paid.length, 1);
  assert.equal(paid[0].status, 'paid');
  assert.equal(paid[0].paidAt, '2026-12-10T15:00:00.000Z');
  assert.equal(paid[0].dueDate, '2026-12-10');
  const seriesSeed = { ...payable, id: 'carne', dueDate: '2027-01-31' };
  await addExpense(seriesSeed);
  fail = true;
  const schedule = { mode: 'installments', total: 12, alreadyPaid: 10 };
  await assert.rejects(replicatePayable(seriesSeed.id, schedule));
  assert.equal((await loadExpenses()).expenses.find(item => item.id === seriesSeed.id).paymentSeries, undefined);
  fail = false;
  const results = await Promise.allSettled([replicatePayable(seriesSeed.id, schedule), replicatePayable(seriesSeed.id, schedule)]);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected']);
  const scheduled = (await loadExpenses()).expenses.filter(item => item.paymentSeries?.id === seriesSeed.id);
  assert.deepEqual(scheduled.map(item => [item.paymentSeries.number, item.dueDate]), [[11, '2027-01-31'], [12, '2027-02-28']]);

  // A migração mantém lançamentos antigos e acrescenta cadastros sem alterar seus IDs.
  const before = await loadExpenses();
  saved = JSON.stringify({ expenses: before.expenses, commands: before.commands });
  const migrated = await loadExpenses();
  assert.deepEqual(migrated.expenses, before.expenses);
  assert.equal(migrated.members.length, 0);
  assert.equal(migrated.categories.length, 10);
  assert.equal(before.categories.length, 10);
  const withMember = await saveMember('Gabriel', 'Filho');
  const member = withMember.members[0];
  await assert.rejects(saveMember(' gabriel ', 'Outro'));
  const withCategory = await saveCategory('Escola', 'expense');
  const category = withCategory.categories.find(item => item.name === 'Escola');
  await assert.rejects(saveCategory('ESCOLA', 'expense'));
  await addExpense({ ...expense, id: 'school', category: 'Escola', categoryId: category.id, memberId: member.id });
  const renamed = await saveCategory('Educação', 'expense', category.id);
  assert.equal(renamed.expenses.find(item => item.id === 'school').category, 'Educação');
  assert.equal(renamed.expenses.find(item => item.id === 'school').memberId, member.id);
  await saveMember('Gabriel Silva', 'Filho', member.id);
  await archiveRegistration('member', member.id, true);
  await assert.rejects(addExpense({ ...expense, id: 'archived-member', memberId: member.id }));
  await archiveRegistration('member', member.id, false);
  await archiveRegistration('category', category.id, true);
  await assert.rejects(addExpense({ ...expense, id: 'archived-category', categoryId: category.id }));
  assert.equal((await loadExpenses()).expenses.some(item => item.id === 'school'), true);
  assert.equal((await loadExpenses()).members[0].name, 'Gabriel Silva');
  await archiveRegistration('category', category.id, false);
  await assert.rejects(saveCategory('Educação', 'income', category.id));
});
