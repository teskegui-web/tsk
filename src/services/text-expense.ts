import { apiEndpoint, apiHeaders } from '@/services/web-api';
import { localDateKey } from './payables';
export type Draft = { transcript: string; description: string; cents: number; category: string; scope: string | null; kind?: 'expense' | 'income'; memberId?: string | null; status?: 'paid' | 'scheduled'; dueDate?: string | null };
export async function interpretText(text: string): Promise<Draft> {
const response = await fetch(apiEndpoint('/voice'), {
    method: 'POST', headers: await apiHeaders(),
    body: JSON.stringify({ text, referenceDate: localDateKey(new Date()) }), signal: AbortSignal.timeout(55000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível interpretar o gasto.');
  return data;
}
