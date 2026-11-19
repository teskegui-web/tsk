import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { familyMonth, familyTotals, loadFamily } from '@/services/finance-family';
import type { Family } from '@/services/finance-family';
import { confirmAction } from '@/services/confirm-action';
import { monthDate } from '@/services/reports';
import { getSupabase } from '@/services/supabase-client';

type Action = 'create' | 'invite' | 'accept' | 'decline' | 'cancel' | 'remove' | 'leave';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Button({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}>
    <Text style={styles.buttonText}>{children}</Text>
  </Pressable>;
}

export default function FamilyScreen() {
  const api = getSupabase();
  const [date, setDate] = useState(() => monthDate(new Date().getFullYear(), new Date().getMonth()));
  const [family, setFamily] = useState<Family>();
  const [email, setEmail] = useState('');
  const [selected, setSelected] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const month = familyMonth(date);

  useFocusEffect(useCallback(() => {
    if (!api) return;
    let active = true;
    setLoading(true);
    setFamily(undefined);
    void loadFamily(month)
      .then(result => { if (active && result) setFamily(result); })
      .catch(() => { if (active) setNotice('Não foi possível carregar a família. Atualize para tentar novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // A revisão força a recarga manual mesmo quando o mês não mudou.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, month, revision]));

  function refresh() {
    setNotice('');
    setRevision(previous => previous + 1);
  }

  async function act(action: Action, target?: string) {
    if (!api || busy || loading) return;
    setBusy(true);
    setNotice('');
    try {
      const { error } = await api.rpc('finance_family', { p_action: action, p_target: target });
      if (error) {
        setNotice(['22023', '42501'].includes(error.code) ? error.message : 'Não foi possível salvar. Tente novamente.');
        return;
      }
      if (action === 'invite') {
        setEmail('');
        setNotice('Convite disponível na aba Família da conta convidada.');
      }
      setFamily(undefined);
      setRevision(previous => previous + 1);
    } finally {
      setBusy(false);
    }
  }

  const accepting = 'Ao entrar, as contas desta família poderão ver suas receitas, despesas e contas a pagar, incluindo os lançamentos que você já fez.';
  const disabled = busy || loading;
  const shown = family?.members.filter(member => !selected || member.id === selected) ?? [];
  const consolidated = familyTotals(shown.flatMap(member => member.entries));

  if (!api) return <View style={styles.content}><Text style={styles.title}>Família</Text><Text>Entre na versão web com sua conta para usar esta opção.</Text></View>;

  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>Família</Text>
    <Text style={styles.muted}>Cada pessoa lança na própria conta. Aqui vocês veem os lançamentos juntos.</Text>
    <Button onPress={refresh} disabled={disabled}>Atualizar</Button>
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.muted}>{notice}</Text> : null}
    {loading ? <Text>Carregando família…</Text> : null}
    {family && !family.joined ? <View style={styles.card}>
      <Text style={styles.section}>Convites</Text>
      {family.invitations.length === 0 ? <Text style={styles.muted}>Você ainda não tem convites.</Text> : null}
      {family.invitations.map(invite => <View key={invite.id} style={styles.card}>
        <Text>{invite.name} convidou você para a família.</Text>
        <View style={styles.row}>
          <Button disabled={disabled} onPress={() => confirmAction('Aceitar convite?', accepting, 'Aceitar', () => { void act('accept', invite.id); })}>Aceitar</Button>
          <Button disabled={disabled} onPress={() => { void act('decline', invite.id); }}>Recusar</Button>
        </View>
      </View>)}
      <Button disabled={disabled} onPress={() => { void act('create'); }}>Criar minha família</Button>
    </View> : null}
    {family?.joined ? <>
      <View style={styles.card}>
        <Text style={styles.section}>Consolidado</Text>
        <View style={styles.row}>
          <Button disabled={disabled} onPress={() => setDate(monthDate(date.getFullYear(), date.getMonth(), -1))}>Mês anterior</Button>
          <Text style={styles.muted}>{date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</Text>
          <Button disabled={disabled} onPress={() => setDate(monthDate(date.getFullYear(), date.getMonth(), 1))}>Próximo mês</Button>
        </View>
        <View style={styles.row}>
          <Button onPress={() => setSelected(undefined)}>Todas as contas</Button>
          {family.members.map(member => <Button key={member.id} onPress={() => setSelected(member.id)}>{member.self ? 'Minha conta' : member.name}</Button>)}
        </View>
        <Text style={styles.muted}>{selected ? shown[0]?.name ?? 'Conta indisponível' : 'Todas as contas'}</Text>
        <Text style={styles.section}>Saldo {money(consolidated.income - consolidated.expense)}</Text>
        <Text>Receitas {money(consolidated.income)} · Despesas {money(consolidated.expense)}</Text>
        <Text>Contas a pagar {money(consolidated.pending)}</Text>
      </View>
      {shown.map(member => <View style={styles.card} key={member.id}>
        <Text style={styles.section}>{member.self ? 'Minha conta' : member.name}</Text>
        {member.entries.length === 0 ? <Text style={styles.muted}>Sem lançamentos neste mês.</Text> : null}
        {[...member.entries].sort((a, b) => b.date.localeCompare(a.date)).map((entry, index) =>
          <View style={styles.row} key={index}>
            <View style={styles.entry}>
              <Text>{entry.date.split('-').reverse().join('/')} · {entry.description}</Text>
              <Text style={styles.muted}>Registrado por {member.self ? 'você' : member.name}</Text>
            </View>
            <Text>{entry.status === 'scheduled' ? 'A pagar · ' : entry.kind === 'income' ? 'Receita · ' : 'Despesa · '}{money(entry.cents)}</Text>
          </View>
        )}
      </View>)}
      <View style={styles.card}>
        <Text style={styles.section}>Contas da família</Text>
        {family.members.map(member => <View style={styles.row} key={member.id}>
          <Text style={styles.entry}>{member.name}{member.self ? ' (você)' : ''}</Text>
          {family.owner && !member.self ? <Button disabled={disabled} onPress={() => confirmAction('Remover conta?', 'A conta perderá o acesso ao consolidado e os lançamentos dela sairão da visão da família.', 'Remover', () => { setSelected(undefined); void act('remove', member.id); })}>Remover</Button> : null}
        </View>)}
        {family.owner ? <>
          <Text style={styles.muted}>As contas que aceitarem o convite poderão ver todos os lançamentos da família, incluindo o histórico.</Text>
          <TextInput accessibilityLabel="E-mail da conta convidada" placeholder="E-mail da conta convidada" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} maxLength={254} style={styles.input} />
          <Button disabled={disabled || !email.trim()} onPress={() => { void act('invite', email); }}>Convidar conta</Button>
          {family.pending.map(address => <View key={address} style={styles.row}>
            <Text style={styles.entry}>{address} · convite pendente</Text>
            <Button disabled={disabled} onPress={() => { void act('cancel', address); }}>Cancelar convite</Button>
          </View>)}
        </> : null}
        <Button disabled={disabled} onPress={() => confirmAction(
          family.owner ? 'Encerrar família?' : 'Sair da família?',
          family.owner ? 'As contas perderão o acesso ao consolidado. Cada pessoa mantém seus próprios lançamentos.' : 'Você perderá o acesso ao consolidado e seus lançamentos sairão da visão da família.',
          family.owner ? 'Encerrar' : 'Sair',
          () => { setSelected(undefined); void act('leave'); },
        )}>{family.owner ? 'Encerrar família' : 'Sair da família'}</Button>
      </View>
    </> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 24, paddingBottom: 120, gap: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { color: '#17382F', fontSize: 32, fontWeight: '700' },
  section: { color: '#17382F', fontSize: 19, fontWeight: '700' },
  muted: { color: '#586B64', lineHeight: 20 },
  card: { backgroundColor: '#FFF', padding: 18, borderRadius: 18, gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  entry: { flex: 1, minWidth: 130 },
  button: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, backgroundColor: '#E2EFE7' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#176345', fontWeight: '600' },
  input: { minHeight: 44, borderColor: '#DCE6DF', borderWidth: 1, borderRadius: 12, padding: 12 },
});
