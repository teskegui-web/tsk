import { createClient, SupabaseClient } from '@supabase/supabase-js';
export const supabaseAuthEnabled = process.env.EXPO_PUBLIC_AUTH_PROVIDER === 'supabase';
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
let client: SupabaseClient | null = null;
export function getSupabase() {
  if (!supabaseAuthEnabled || !supabaseUrl || !publicKey) return null;
  client ??= createClient(supabaseUrl, publicKey, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
export async function authHeaders() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Configure o projeto Supabase para ativar o login.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Sua sessão expirou. Entre novamente.');
  return { 'Content-Type': 'application/json', apikey: publicKey, Authorization: `Bearer ${data.session.access_token}` };
}
// Cada operação fixa o token da conta para não trocar de usuário durante uma gravação.
async function accountClient(userId: string) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Autenticação não configurada.');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== userId) throw new Error('A conta mudou. Entre novamente.');
  return createClient(supabaseUrl, publicKey, { global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export function supabaseStore(userId: string) {
  return {
    async read() {
      const api = await accountClient(userId);
      const { data, error } = await api.from('finance_states').select('payload,version').eq('user_id', userId).maybeSingle();
      if (error) throw new Error('Não foi possível carregar os dados da conta.');
      return { store: data?.payload ?? null, version: data?.version ?? 0 };
    },
    async write(store: unknown, version: number) {
      const api = await accountClient(userId);
      const { data, error } = await api.rpc('save_finance_state', { p_payload: store, p_expected_version: version });
      if (error) throw new Error(error.code === '40001' ? 'Os dados mudaram em outro dispositivo. Atualize e tente novamente.' : 'Não foi possível salvar na sua conta.');
      return Number(data);
    },
  };
}
