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
  const { addExpense, deleteExpense, loadExpenses } = await import('../src/services/expense-store.ts');
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
});
