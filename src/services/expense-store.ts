import AsyncStorage from '@react-native-async-storage/async-storage';

export type Expense = { id: string; description: string; cents: number; category: string; scope: string; createdAt: string };
type Store = { expenses: Expense[]; commands: string[] };
const key = '@agente-tsk/expenses-v1';
let chain: Promise<unknown> = Promise.resolve();
export async function loadExpenses(): Promise<Store> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return { expenses: [], commands: [] };
  const data = JSON.parse(raw);
  if (!Array.isArray(data.expenses) || !Array.isArray(data.commands)) throw new Error('Não foi possível ler as despesas salvas.');
  return data;
}
function update(change: (store: Store) => void): Promise<Store> {
  const task = chain.then(async () => {
    const store = await loadExpenses();
    change(store);
    await AsyncStorage.setItem(key, JSON.stringify(store));
    return store;
  });
  chain = task.catch(() => {});
  return task;
}
export function addExpense(expense: Expense, commandId?: string) {
  return update(store => {
    if (commandId && store.commands.includes(commandId)) return;
    store.expenses.unshift(expense);
    if (commandId) store.commands.push(commandId);
  });
}
export function deleteExpense(id: string) {
  return update(store => { store.expenses = store.expenses.filter(item => item.id !== id); });
}
