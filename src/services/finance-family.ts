import { getSupabase } from '@/services/supabase-client';

type Entry = { description: string; cents: number; kind: string | null; status: string | null; date: string };
type Member = { id: string; name: string; self: boolean; entries: Entry[] };
export type Family = {
  owner: boolean;
  joined: boolean;
  members: Member[];
  invitations: { id: string; name: string }[];
  pending: string[];
};

export function familyTotals(entries: Entry[]) {
  let income = 0;
  let expense = 0;
  let pending = 0;
  for (const entry of entries) {
    if (entry.status === 'scheduled') {
      if (entry.kind !== 'income') pending += entry.cents;
    } else if (entry.kind === 'income') income += entry.cents;
    else expense += entry.cents;
  }
  return { income, expense, pending };
}

export function familyMonth(date: Date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

export async function loadFamily(month: string) {
  const api = getSupabase();
  if (!api) return null;
  const { data, error } = await api.rpc('finance_family', { p_action: 'read', p_month: month });
  if (error) throw error;
  return data as Family;
}
