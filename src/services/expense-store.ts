import AsyncStorage from '@react-native-async-storage/async-storage';
import { schedulePayable } from './payables.ts';
import type { PaymentSchedule, PaymentSeries } from './payables.ts';

export type Expense = { id: string; description: string; cents: number; category: string; scope: string; createdAt: string; kind?: 'expense' | 'income'; status?: 'scheduled' | 'paid'; dueDate?: string; paidAt?: string; memberId?: string; categoryId?: string; paymentSeries?: PaymentSeries };
export type FamilyMember = { id: string; name: string; role: string; archived?: boolean };
export type Category = { id: string; name: string; kind: 'expense' | 'income'; archived?: boolean };
type Store = { expenses: Expense[]; commands: string[]; members: FamilyMember[]; categories: Category[] };
function initialCategories(): Category[] {
  return [
    ...['Alimentação', 'Combustível', 'Moradia', 'Lazer', 'Outros'].map((name, index) => ({ id: `expense-${index}`, name, kind: 'expense' as const })),
    ...['Salário', 'Vale-alimentação', 'Freelance', 'Renda extra', 'Outras receitas'].map((name, index) => ({ id: `income-${index}`, name, kind: 'income' as const })),
  ];
}
const key = '@agente-tsk/expenses-v1';
let chain: Promise<unknown> = Promise.resolve();
type RemoteStore = { read(): Promise<{ store: unknown; version: number }>; write(store: Store, version: number): Promise<number> };
let remoteStore: RemoteStore | null = null;
export function configureRemoteStore(adapter: RemoteStore | null) { remoteStore = adapter; }
export const cloudStorage = () => typeof location !== 'undefined' && !['localhost', '127.0.0.1'].includes(location.hostname);
function parseStore(value: unknown): Store {
  if (!value) return { expenses: [], commands: [], members: [], categories: initialCategories() };
  const data = value as Partial<Store>;
  if (!Array.isArray(data.expenses) || !Array.isArray(data.commands)) throw new Error('Não foi possível ler as despesas salvas.');
  return { ...data, expenses: data.expenses, commands: data.commands, members: Array.isArray(data.members) ? data.members : [], categories: Array.isArray(data.categories) ? data.categories : initialCategories() };
}
async function readStore(adapter: RemoteStore | null): Promise<{ store: Store; version: number }> {
  if (adapter) {
    const result = await adapter.read();
    return { store: parseStore(result.store), version: result.version };
  }
  if (cloudStorage()) {
    const response = await fetch('/api/store', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível acessar seus dados. Verifique a conexão e o login.');
    const result = await response.json();
    return { store: parseStore(result.store), version: result.version };
  }
  const raw = await AsyncStorage.getItem(key);
  return { store: parseStore(raw ? JSON.parse(raw) : null), version: 0 };
}
export async function loadExpenses(): Promise<Store> {
  return (await readStore(remoteStore)).store;
}
function update(change: (store: Store) => void): Promise<Store> {
  const adapter = remoteStore;
  const task = chain.then(async () => {
    if (remoteStore !== adapter) throw new Error('A conta mudou. Tente novamente na conta atual.');
    const { store, version } = await readStore(adapter);
    if (remoteStore !== adapter) throw new Error('A conta mudou. Tente novamente na conta atual.');
    change(store);
    if (adapter) {
      await adapter.write(store, version);
    } else if (cloudStorage()) {
      const response = await fetch('/api/store', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': String(version) }, body: JSON.stringify(store) });
      if (!response.ok) throw new Error(response.status === 409 ? 'Os dados mudaram em outro dispositivo. Reabra esta tela e tente novamente.' : 'Não foi possível salvar na nuvem. Tente novamente.');
    } else await AsyncStorage.setItem(key, JSON.stringify(store));
    return store;
  });
  chain = task.catch(() => {});
  return task;
}
export function addExpense(expense: Expense, commandId?: string, schedule?: PaymentSchedule) {
  return update(store => {
    if (commandId && store.commands.includes(commandId)) return;
    if (expense.memberId && !store.members.some(member => member.id === expense.memberId && !member.archived)) throw new Error('Selecione um membro ativo da família.');
    if (expense.categoryId) {
      const category = store.categories.find(item => item.id === expense.categoryId && !item.archived && item.kind === (expense.kind ?? 'expense'));
      if (!category) throw new Error('Selecione uma categoria ativa para este tipo de lançamento.');
      expense.category = category.name;
    }
    const entries = schedule ? schedulePayable(expense, schedule) : [expense];
    if (store.expenses.length + entries.length > 10000) throw new Error('Limite de 10.000 lançamentos atingido.');
    store.expenses.unshift(...entries);
    if (commandId) store.commands.push(commandId);
  });
}
export function replicatePayable(id: string, schedule: PaymentSchedule) {
  return update(store => {
    const index = store.expenses.findIndex(item => item.id === id);
    if (index < 0) throw new Error('Conta não encontrada.');
    const entries = schedulePayable(store.expenses[index], schedule);
    if (store.expenses.length + entries.length - 1 > 10000) throw new Error('Limite de 10.000 lançamentos atingido.');
    store.expenses.splice(index, 1, ...entries);
  });
}
function cleanName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed || trimmed.length > 50) throw new Error('Informe um nome com até 50 caracteres.');
  return trimmed;
}
const normalize = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function saveMember(name: string, role: string, id?: string) {
  return update(store => {
    const cleaned = cleanName(name);
    if (store.members.some(item => item.id !== id && normalize(item.name) === normalize(cleaned))) throw new Error('Já existe um membro com esse nome, inclusive entre os arquivados.');
    if (role.trim().length > 40) throw new Error('Use até 40 caracteres no parentesco.');
    const item = id ? store.members.find(member => member.id === id) : undefined;
    if (id && !item) throw new Error('Membro não encontrado.');
    if (!item && store.members.length >= 100) throw new Error('Limite de 100 membros atingido. Edite ou restaure um cadastro existente.');
    if (item) { item.name = cleaned; item.role = role.trim(); }
    else store.members.push({ id: `member-${Date.now()}-${Math.random()}`, name: cleaned, role: role.trim() });
  });
}
export function saveCategory(name: string, kind: 'expense' | 'income', id?: string) {
  return update(store => {
    const cleaned = cleanName(name);
    if (store.categories.some(item => item.id !== id && item.kind === kind && normalize(item.name) === normalize(cleaned))) throw new Error('Já existe uma categoria com esse nome para esse tipo de lançamento.');
    const item = id ? store.categories.find(category => category.id === id) : undefined;
    if (id && !item) throw new Error('Categoria não encontrada.');
    if (!item && store.categories.length >= 200) throw new Error('Limite de 200 categorias atingido. Edite ou restaure uma categoria existente.');
    if (item) {
      if (item.kind !== kind) throw new Error('O tipo de uma categoria existente não pode ser alterado.');
      for (const expense of store.expenses) if (expense.categoryId === id || (!expense.categoryId && expense.category === item.name && (expense.kind ?? 'expense') === kind)) { expense.category = cleaned; expense.categoryId = id; }
      item.name = cleaned;
    } else store.categories.push({ id: `category-${Date.now()}-${Math.random()}`, name: cleaned, kind });
  });
}
export function archiveRegistration(type: 'member' | 'category', id: string, archived: boolean) {
  return update(store => {
    const item = (type === 'member' ? store.members : store.categories).find(entry => entry.id === id);
    if (!item) throw new Error('Cadastro não encontrado.');
    item.archived = archived;
  });
}
export function deleteExpense(id: string) {
  return update(store => { store.expenses = store.expenses.filter(item => item.id !== id); });
}
export function payExpense(id: string, paidAt = new Date().toISOString()) {
  return update(store => {
    const item = store.expenses.find(expense => expense.id === id);
    if (!item) throw new Error('Conta não encontrada.');
    if (item.status !== 'scheduled') return;
    if (item.kind === 'income') throw new Error('Este lançamento não é uma conta a pagar.');
    item.status = 'paid'; item.paidAt = paidAt;
  });
}
export function importBackup(value: unknown) {
  return update(store => {
    if (store.expenses.length || store.members.length) throw new Error('Importe apenas em uma conta vazia, para não sobrescrever seus dados.');
    const data = value as Partial<Store>;
    if (!data || !Array.isArray(data.expenses) || !Array.isArray(data.commands) || data.expenses.length > 10000) throw new Error('Backup inválido.');
    const members = data.members || [];
    const categories = data.categories || initialCategories();
    if (!Array.isArray(members) || members.length > 100 || members.some(item => !item || typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.role !== 'string')) throw new Error('Membros inválidos no backup.');
    if (!Array.isArray(categories) || categories.length > 200 || categories.some(item => !item || typeof item.id !== 'string' || typeof item.name !== 'string' || !['expense', 'income'].includes(item.kind))) throw new Error('Categorias inválidas no backup.');
    for (const item of data.expenses) {
      if (!item || typeof item.id !== 'string' || typeof item.description !== 'string' || typeof item.category !== 'string' || typeof item.scope !== 'string' || !Number.isSafeInteger(item.cents) || item.cents <= 0 || item.cents > 100000000 || !Number.isFinite(new Date(item.createdAt).getTime())) throw new Error('Lançamento inválido no backup.');
    }
    store.expenses = data.expenses; store.commands = data.commands; store.members = members; store.categories = categories;
  });
}
