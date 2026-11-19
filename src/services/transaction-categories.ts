export type TransactionKind = 'expense' | 'income';
export const expenseCategories = ['Alimentação', 'Combustível', 'Moradia', 'Lazer', 'Outros'];
export const incomeCategories = ['Salário', 'Vale-alimentação', 'Freelance', 'Renda extra', 'Outras receitas'];
export const categoriesFor = (kind: TransactionKind) => kind === 'income' ? incomeCategories : expenseCategories;
