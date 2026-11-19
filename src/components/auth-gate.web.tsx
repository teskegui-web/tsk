import type { Session } from '@supabase/supabase-js';
import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getSupabase, supabaseStore } from '@/services/supabase-client';
import { configureRemoteStore } from '@/services/expense-store';

type Mode = 'login' | 'signup' | 'recover' | 'password';
export function AuthGate({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getSupabase()));
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const api = getSupabase();
  const accountId = useRef<string | null>(null);
  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage('Não foi possível recuperar a sessão. Entre novamente.');
      if (accountId.current !== (data.session?.user.id ?? null)) {
        accountId.current = data.session?.user.id ?? null;
        configureRemoteStore(data.session ? supabaseStore(data.session.user.id) : null);
      }
      setSession(data.session); setLoading(false);
    });
    const { data } = api.auth.onAuthStateChange((event, next) => {
      if (accountId.current !== (next?.user.id ?? null)) {
        accountId.current = next?.user.id ?? null;
        configureRemoteStore(next ? supabaseStore(next.user.id) : null);
      }
      setSession(next); setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setMode('password');
      if (event === 'SIGNED_OUT') { setMode('login'); setPassword(''); setConfirmation(''); }
    });
    return () => { active = false; data.subscription.unsubscribe(); accountId.current = null; configureRemoteStore(null); };
  }, [api]);
  function switchMode(value: Mode) { setMode(value); setPassword(''); setConfirmation(''); setMessage(''); }
  async function submit() {
    if (!api || busy) return;
    const cleanEmail = email.trim();
    if (mode !== 'password' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setMessage('Informe um e-mail válido.'); return; }
    if (['signup', 'password'].includes(mode) && (password.length < 10 || password !== confirmation)) { setMessage('Use uma senha com pelo menos dez caracteres e confirme a mesma senha.'); return; }
    if (mode === 'signup' && !name.trim()) { setMessage('Informe seu nome.'); return; }
    setBusy(true); setMessage('');
    try {
      if (mode === 'login') {
        const { error } = await api.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw new Error('Não foi possível entrar. Confira os dados e a confirmação do seu e-mail.');
      } else if (mode === 'signup') {
        const { data, error } = await api.auth.signUp({ email: cleanEmail, password, options: { data: { full_name: name.trim() }, emailRedirectTo: location.origin + '/' } });
        if (error) throw new Error('Não foi possível concluir o cadastro. Tente novamente ou recupere uma conta existente.');
        setPassword(''); setConfirmation('');
        if (!data.session) setMessage('Confira sua caixa de entrada para confirmar o e-mail e depois entrar.');
      } else if (mode === 'recover') {
        const { error } = await api.auth.resetPasswordForEmail(cleanEmail, { redirectTo: location.origin + '/' });
        if (error) throw new Error('Não foi possível enviar agora. Tente mais tarde.');
        setMessage('Se existir uma conta para este e-mail, você receberá as instruções de recuperação.');
      } else {
        const { error } = await api.auth.updateUser({ password });
        if (error) throw new Error('Não foi possível atualizar a senha. Solicite um novo link.');
        setPassword(''); setConfirmation(''); setMode('login'); setMessage('Senha atualizada.');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }
  async function google() {
    if (!api || busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await api.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/', scopes: 'openid email profile' } });
      if (error) throw error;
    } catch { setMessage('Login Google indisponível. Confira a configuração do provedor.'); setBusy(false); }
  }
  const accountName = [session?.user.user_metadata?.full_name, session?.user.user_metadata?.name, session?.user.email].find(value => typeof value === 'string' && value.trim())?.trim() || 'Minha conta';
  if (loading) return <View style={styles.center}><ActivityIndicator color="#19734F" /><Text>Carregando sua conta…</Text></View>;
  if (session && mode !== 'password') return <View key={session.user.id} style={{ flex: 1 }}><View style={styles.account}><Text accessibilityLabel={`Conta de ${accountName}`} numberOfLines={1} style={[styles.muted, { flex: 1, fontWeight: '600' }]}>{accountName}</Text><Pressable accessibilityRole="button" style={styles.link} onPress={() => { void api?.auth.signOut(); }}><Text style={styles.linkText}>Sair</Text></Pressable></View>{children}</View>;
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><View style={styles.card}><Text style={styles.brand}>Agente Financeiro</Text><Text style={styles.title}>{mode === 'signup' ? 'Crie sua conta' : mode === 'recover' ? 'Recuperar acesso' : mode === 'password' ? 'Defina uma nova senha' : 'Bom ter você por aqui'}</Text><Text style={styles.muted}>Organize as contas da família e acesse seus dados de qualquer dispositivo.</Text>
    {!api ? <Text style={styles.notice}>Integração preparada. Configure o projeto Supabase para ativar cadastro, senha e Google. Nenhuma credencial será enviada enquanto isso.</Text> : null}
    {['login', 'signup'].includes(mode) ? <View style={styles.tabs}><Pressable accessibilityRole="button" onPress={() => switchMode('login')} style={[styles.tab, mode === 'login' && styles.selected]}><Text>Entrar</Text></Pressable><Pressable accessibilityRole="button" onPress={() => switchMode('signup')} style={[styles.tab, mode === 'signup' && styles.selected]}><Text>Cadastrar</Text></Pressable></View> : null}
    {mode === 'signup' ? <><Text style={styles.label}>Nome</Text><TextInput accessibilityLabel="Nome completo" style={styles.input} value={name} onChangeText={setName} maxLength={100} autoComplete="name" /></> : null}
    {mode !== 'password' ? <><Text style={styles.label}>E-mail</Text><TextInput accessibilityLabel="E-mail" style={styles.input} value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" autoCapitalize="none" maxLength={254} /></> : null}
    {mode !== 'recover' ? <><Text style={styles.label}>{mode === 'password' ? 'Nova senha' : 'Senha'}</Text><TextInput accessibilityLabel="Senha" style={styles.input} secureTextEntry value={password} onChangeText={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} maxLength={128} /></> : null}
    {['signup', 'password'].includes(mode) ? <><Text style={styles.label}>Confirmar senha</Text><TextInput accessibilityLabel="Confirmar senha" style={styles.input} secureTextEntry value={confirmation} onChangeText={setConfirmation} autoComplete="new-password" maxLength={128} /><Text style={styles.muted}>Pelo menos dez caracteres.</Text></> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text> : null}
    <Pressable accessibilityRole="button" disabled={!api || busy} style={[styles.button, (!api || busy) && { opacity: 0.5 }]} onPress={() => { void submit(); }}><Text style={styles.buttonText}>{busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : mode === 'recover' ? 'Enviar link de recuperação' : mode === 'password' ? 'Salvar nova senha' : 'Entrar'}</Text></Pressable>
    {['login', 'signup'].includes(mode) ? <><Text style={styles.or}>ou</Text><Pressable accessibilityRole="button" disabled={!api || busy} style={styles.google} onPress={() => { void google(); }}><Text style={styles.label}>Continuar com Google</Text></Pressable><Pressable accessibilityRole="button" style={styles.link} onPress={() => switchMode('recover')}><Text style={styles.linkText}>Esqueci minha senha</Text></Pressable></> : <Pressable accessibilityRole="button" style={styles.link} onPress={() => switchMode('login')}><Text style={styles.linkText}>Voltar para entrar</Text></Pressable>}
  </View></ScrollView>;
}
const styles = StyleSheet.create({ page: { flexGrow: 1, backgroundColor: '#F4F7F5', alignItems: 'center', justifyContent: 'center', padding: 24 }, card: { width: '100%', maxWidth: 460, backgroundColor: '#FFF', borderRadius: 24, padding: 28, gap: 14 }, brand: { color: '#19734F', fontWeight: '800', fontSize: 19 }, title: { color: '#17382F', fontWeight: '700', fontSize: 27 }, muted: { color: '#586B64', lineHeight: 21, fontSize: 13 }, label: { color: '#344F45', fontWeight: '600' }, input: { backgroundColor: '#F3F6F4', borderColor: '#DCE6DF', borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, color: '#17382F' }, tabs: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 12, backgroundColor: '#F3F6F4' }, selected: { backgroundColor: '#D8EEE2' }, button: { backgroundColor: '#19734F', padding: 16, borderRadius: 12, minHeight: 48 }, buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '700' }, google: { borderColor: '#DCE6DF', borderWidth: 1, padding: 16, borderRadius: 12, alignItems: 'center', minHeight: 48 }, or: { color: '#7C8B83', textAlign: 'center' }, link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, linkText: { color: '#19734F', fontWeight: '600' }, notice: { color: '#805923', lineHeight: 21, fontSize: 13 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, account: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E2EFE7', paddingHorizontal: 20 } });
