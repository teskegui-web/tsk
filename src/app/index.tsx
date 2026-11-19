import { VoiceExpense } from '@/components/voice-expense';
import { addExpense, cloudStorage, Category, deleteExpense, Expense, FamilyMember, loadExpenses, payExpense, replicatePayable } from '@/services/expense-store';
import { PayablesCard } from '@/components/payables-card';
import { PaymentDetails } from '@/components/payment-details';
import { groupPaymentEntries, installmentProgress, parseDueDate, paymentGroupLabel } from '@/services/payables';
import { emptySchedule, parseSchedule, PayableScheduleFields } from '@/components/payable-schedule-fields';
import { Draft } from '@/services/text-expense';
import { categoriesFor, TransactionKind } from '@/services/transaction-categories';
import { buildReport } from '@/services/reports';
import { confirmAction } from '@/services/confirm-action';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function HomeScreen() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [detailKey, setDetailKey] = useState<string>();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [scheduled, setScheduled] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [scheduleFields, setScheduleFields] = useState(emptySchedule);
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [registeredCategories, setRegisteredCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [memberId, setMemberId] = useState<string>();
  const selectedMember = members.find(item => item.id === memberId && !item.archived);
  const categories = registeredCategories.filter(item => item.kind === kind && !item.archived).map(item => item.name);
  const [category, setCategory] = useState('Alimentação');
  const selectedCategory = categories.includes(category) ? category : categories[0];
  const [scope, setScope] = useState('Familiar');
  const [error, setError] = useState('');
  const [lastVoiceExpense, setLastVoiceExpense] = useState<Expense | null>(null);
  const [ready, setReady] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadExpenses().then(store => { if (active) { setExpenses(store.expenses); setMembers(store.members); setRegisteredCategories(store.categories); setReady(true); } })
      .catch(() => { if (active) setError('Não foi possível carregar os gastos. Feche e abra o app para tentar novamente.'); });
    return () => { active = false; };
  }, []));
  const now = new Date();
  const monthly = expenses.filter(item => {
    const date = new Date(item.paidAt ?? item.createdAt);
    return item.status !== 'scheduled' && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const summary = buildReport(expenses, now.getFullYear(), now.getMonth(), 'Todos');
  const total = summary.total;
  const progress = installmentProgress(expenses);
  const recentGroups = groupPaymentEntries(expenses);
  const details = recentGroups.find(group => group.key === detailKey);
  const family = monthly.filter(item => item.scope === 'Familiar' && item.kind !== 'income').reduce((sum, item) => sum + item.cents, 0);

  async function save() {
    if (saving.current) return;
    if (!ready) { setError('Aguarde o carregamento das despesas.'); return; }
    const normalized = amount.trim().replace(',', '.');
    if (!description.trim()) { setError('Informe uma descrição.'); return; }
    if (!selectedCategory) { setError('Cadastre ou restaure uma categoria para este tipo de lançamento na aba Cadastros.'); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) { setError('Use um valor como 20 ou 20,50, sem separador de milhar.'); return; }
    const cents = Math.round(Number(normalized) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000) { setError('Informe um valor entre R$ 0,01 e R$ 1.000.000,00.'); return; }
    const parsedDueDate = scheduled ? parseDueDate(dueDate) : null;
    if (scheduled && !parsedDueDate) { setError('Informe um vencimento válido no formato DD/MM/AAAA.'); return; }
    saving.current = true;
    setIsSaving(true);
    try {
      const schedule = scheduled ? parseSchedule(scheduleFields) : undefined;
      const store = await addExpense({ id: `${Date.now()}-${Math.random()}`, description: description.trim(), cents, category: selectedCategory, categoryId: registeredCategories.find(item => item.name === selectedCategory && item.kind === kind)?.id, memberId: selectedMember?.id, scope, kind, createdAt: new Date().toISOString(), ...(scheduled ? { status: 'scheduled', dueDate: parsedDueDate! } : {}) }, undefined, schedule);
      setExpenses(store.expenses); setDescription(''); setAmount(''); setDueDate(''); setScheduleFields(emptySchedule); setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar o lançamento.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  async function erase(id: string) {
    try { const store = await deleteExpense(id); setExpenses(store.expenses); }
    catch { setError('Não foi possível excluir a despesa. Tente novamente.'); }
  }
  async function markPaid(id: string) {
    try { const store = await payExpense(id); setExpenses(store.expenses); }
    catch { Alert.alert('Não foi possível registrar o pagamento', 'Tente novamente. A conta continua pendente.'); }
  }

  async function saveVoice(draft: Draft, commandId?: string) {
    if (!ready) throw new Error('Aguarde o carregamento das despesas.');
    const voiceKind = draft.kind ?? 'expense';
    const voiceScheduled = draft.status === 'scheduled';
    const voiceDueDate = typeof draft.dueDate === 'string' ? parseDueDate(draft.dueDate.split('-').reverse().join('/')) : null;
    if (voiceScheduled && (voiceKind !== 'expense' || !voiceDueDate)) throw new Error('Não foi possível identificar o vencimento. Diga dia, mês e ano.');
    if (draft.dueDate && !voiceScheduled) throw new Error('O agendamento não foi identificado. Tente dizer conta a pagar com vencimento.');
    if (!['expense', 'income'].includes(voiceKind) || !Number.isSafeInteger(draft.cents) || draft.cents <= 0 || draft.cents > 100000000 ||
        typeof draft.description !== 'string' || !draft.description.trim() ||
        !registeredCategories.some(item => item.kind === voiceKind && !item.archived && item.name === draft.category) || ![null, 'Pessoal', 'Familiar'].includes(draft.scope)) {
      throw new Error('Não foi possível identificar um lançamento válido. Tente novamente.');
    }
    const expense: Expense = { id: commandId ?? `${Date.now()}-${Math.random()}`, description: draft.description.trim(), cents: draft.cents, category: draft.category, categoryId: registeredCategories.find(item => item.name === draft.category && item.kind === voiceKind)?.id, memberId: draft.memberId ?? selectedMember?.id, scope: draft.scope ?? scope, kind: voiceKind, createdAt: new Date().toISOString(), ...(voiceScheduled ? { status: 'scheduled', dueDate: voiceDueDate! } : {}) };
    const store = await addExpense(expense, commandId);
    setExpenses(store.expenses); setLastVoiceExpense(expense);
  }

  function remove(item: Expense) {
    confirmAction('Excluir lançamento?', `${item.description} · ${money(item.cents)}`, 'Excluir', () => { void erase(item.id); });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.row}><Text style={styles.brand}>Agente Financeiro</Text><Text style={styles.muted}>PROTÓTIPO</Text></View>
          <Text style={styles.title}>Suas contas, mais claras.</Text>
          <Text style={styles.muted}>Um lugar para organizar os gastos da casa.</Text>
          <View style={styles.summary}>
            <Text style={styles.light}>SALDO DO MÊS · {now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}</Text>
            <Text style={styles.total}>{money(summary.balance)}</Text>
            <Text style={styles.light}>Receitas: {money(summary.income.total)} · Despesas: {money(total)}</Text>
            <Text style={styles.light}>Despesas familiares: {money(family)} · Pessoais: {money(total - family)}</Text>
            <Text style={styles.light}>Receitas − despesas registradas. Inclui benefícios de uso restrito, como vale-alimentação.</Text>
          </View>
          <Text style={styles.muted}>{ready ? (cloudStorage() ? 'Dados salvos na sua conta. Os membros são perfis; convites e grupos compartilhados ainda não estão ativos.' : 'Gastos salvos neste aparelho. O compartilhamento familiar ainda não está ativo.') : 'Carregando despesas…'}</Text>
          <VoiceExpense onDraft={saveVoice} disabled={!ready} categories={registeredCategories.filter(item => !item.archived)} members={members.filter(item => !item.archived)} />
          {ready ? <PayablesCard expenses={expenses} members={members} onPay={markPaid} onDelete={remove} onDetails={setDetailKey} onReplicate={async (id, schedule) => { const store = await replicatePayable(id, schedule); setExpenses(store.expenses); }} /> : null}
          {lastVoiceExpense && expenses.some(item => item.id === lastVoiceExpense.id) ? (
            <View style={styles.card}>
              <Text accessibilityLiveRegion="polite" style={styles.label}>
                {lastVoiceExpense.status === 'scheduled' ? 'Conta programada' : lastVoiceExpense.kind === 'income' ? 'Receita adicionada' : 'Despesa adicionada'}: {money(lastVoiceExpense.cents)} em {lastVoiceExpense.category}
              </Text>
              <Text style={styles.muted}>{lastVoiceExpense.description} · {lastVoiceExpense.scope}</Text>
              {lastVoiceExpense.status === 'scheduled' ? <Text style={styles.label}>Vencimento: {lastVoiceExpense.dueDate?.split('-').reverse().join('/')}</Text> : null}
              <Pressable accessibilityRole="button" style={styles.chip} onPress={() => {
                const id = lastVoiceExpense.id;
                void erase(id);
              }}><Text style={styles.chipText}>Desfazer lançamento por voz</Text></Pressable>
            </View>
          ) : null}
          <View style={styles.card}>
            <Text style={styles.section}>Novo lançamento</Text>
            <View style={styles.chips}>{(['expense', 'income'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: !scheduled && kind === value }} style={[styles.chip, !scheduled && kind === value && styles.selected]} onPress={() => { setScheduled(false); setKind(value); setCategory(categoriesFor(value)[0]); setError(''); }}><Text style={styles.chipText}>{value === 'income' ? '+ Receita' : '− Despesa'}</Text></Pressable>)}<Pressable accessibilityRole="button" accessibilityState={{ selected: scheduled }} style={[styles.chip, scheduled && styles.selected]} onPress={() => { setScheduled(true); setKind('expense'); setCategory(categoriesFor('expense')[0]); setError(''); }}><Text style={styles.chipText}>Conta a pagar</Text></Pressable></View>
            <Text style={styles.label}>Descrição</Text>
            <TextInput accessibilityLabel="Descrição do lançamento" style={styles.input} placeholder={kind === 'income' ? 'Ex.: Salário de novembro' : 'Ex.: Gasolina'} placeholderTextColor="#728078" value={description} onChangeText={setDescription} maxLength={100} />
            <Text style={styles.label}>Valor em reais</Text>
            <TextInput accessibilityLabel="Valor em reais" style={styles.input} placeholder="0,00" placeholderTextColor="#728078" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} maxLength={14} />
            {scheduled ? <>
              <Text style={styles.label}>Vencimento (DD/MM/AAAA)</Text>
              <TextInput accessibilityLabel="Data de vencimento" style={styles.input} placeholder="Ex.: 30/11/2026" placeholderTextColor="#728078" value={dueDate} onChangeText={setDueDate} maxLength={10} keyboardType="numbers-and-punctuation" />
              <PayableScheduleFields value={scheduleFields} onChange={setScheduleFields} />
            </> : null}
            <Text style={styles.label}>Categoria</Text>
            <View style={styles.chips}>{categories.map(value => <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedCategory === value }} key={value} onPress={() => setCategory(value)} style={[styles.chip, selectedCategory === value && styles.selected]}><Text style={styles.chipText}>{value}</Text></Pressable>)}</View>
            <Text style={styles.label}>Este lançamento é</Text>
            <View style={styles.chips}>{['Pessoal', 'Familiar'].map(value => <Pressable accessibilityRole="button" accessibilityState={{ selected: scope === value }} key={value} onPress={() => setScope(value)} style={[styles.chip, scope === value && styles.selected]}><Text style={styles.chipText}>{value}</Text></Pressable>)}</View>
            <Text style={styles.label}>Para quem é este lançamento?</Text>
            <View style={styles.chips}><Pressable accessibilityRole="button" accessibilityState={{ selected: !selectedMember }} style={[styles.chip, !selectedMember && styles.selected]} onPress={() => setMemberId(undefined)}><Text style={styles.chipText}>Geral / sem membro</Text></Pressable>{members.filter(item => !item.archived).map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: selectedMember?.id === item.id }} style={[styles.chip, selectedMember?.id === item.id && styles.selected]} onPress={() => setMemberId(item.id)}><Text style={styles.chipText}>{item.name}</Text></Pressable>)}</View>
            <Text style={styles.muted}>Cadastre pessoas e categorias na aba Cadastros. Ex.: categoria Escola, membro Gabriel.</Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" onPress={save} disabled={isSaving} style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}><Text style={styles.buttonText}>{isSaving ? 'Salvando…' : scheduled ? 'Programar conta a pagar' : kind === 'income' ? '+ Adicionar receita' : '− Adicionar despesa'}</Text></Pressable>
            <Text style={styles.muted}>{scheduled ? 'As contas ficam pendentes até você marcar cada uma como paga.' : kind === 'income' ? 'Registre valores efetivamente recebidos. Cada receita é um lançamento único; não há repetição automática.' : 'Confira os dados antes de adicionar a despesa.'}</Text>
          </View>
          <Text style={styles.section}>Últimos registros</Text>
          {expenses.length === 0 ? <View style={styles.card}>
            <Text style={styles.label}>Nenhum lançamento registrado</Text>
          </View> : recentGroups.map(({ key, entries }) => {
            const [item] = entries;
            if (item.paymentSeries) {
              const groupTotal = entries.reduce((sum, entry) => sum + entry.cents, 0);
              return <View key={key} style={styles.expense}>
                <View style={styles.flex}>
                  <Text style={styles.label}>{item.description}</Text>
                  <Text style={styles.muted}>{item.paymentSeries.mode === 'installments' ? 'Carnê / Parcelada' : 'Repetição mensal'} · {item.category}</Text>
                  <Text style={styles.muted}>{paymentGroupLabel(item, progress, entries)}</Text>
                </View>
                <View style={styles.amountColumn}>
                  <Text style={styles.label}>{money(groupTotal)}</Text>
                  <Text style={styles.muted}>Total registrado</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={'Detalhar ' + item.description} onPress={() => setDetailKey(key)} style={styles.delete}>
                    <Text style={styles.chipText}>Detalhar</Text>
                  </Pressable>
                </View>
              </View>;
            }
            const pending = item.status === 'scheduled';
            const date = pending ? 'Vencimento ' + (item.dueDate?.split('-').reverse().join('/') ?? 'não informado') :
              (item.paidAt ? 'Pago em ' : '') + new Date(item.paidAt ?? item.createdAt).toLocaleDateString('pt-BR');
            return <View key={item.id} style={styles.expense}>
              <View style={styles.flex}>
                <Text style={styles.label}>{item.description}</Text>
                <Text style={styles.muted}>{pending ? 'Conta a pagar' : item.kind === 'income' ? 'Receita' : 'Despesa'} · {item.category} · {item.scope} · {members.find(member => member.id === item.memberId)?.name || 'Geral'}</Text>
                <Text style={styles.muted}>{date}</Text>
                </View>
              <View style={styles.amountColumn}>
                <Text style={[styles.label, { color: pending ? '#8A5D1F' : item.kind === 'income' ? '#19734F' : '#A33939' }]}>
                  {pending ? money(item.cents) : (item.kind === 'income' ? '+ ' : '− ') + money(item.cents)}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Excluir ${item.description}`} onPress={() => remove(item)} style={styles.delete}><Text style={styles.error}>Excluir</Text></Pressable>
              </View>
            </View>;
          })}
        </ScrollView>
        {details ? <PaymentDetails entries={details.entries} onClose={() => setDetailKey(undefined)} onPay={markPaid} onDelete={remove} /> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { flex: 1, backgroundColor: '#F4F7F5' },
  content: { padding: 24, paddingBottom: 120, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { fontSize: 28, fontWeight: '900', color: '#176345' },
  title: { fontSize: 28, fontWeight: '700', color: '#17382F' }, muted: { fontSize: 13, color: '#586B64', lineHeight: 20 },
  summary: { backgroundColor: '#153F34', borderRadius: 24, padding: 24, gap: 16 },
  light: { color: '#CEE7DC', fontSize: 12, lineHeight: 20 }, total: { color: '#FFF', fontSize: 38, fontWeight: '700' },
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, gap: 12 }, section: { color: '#17382F', fontSize: 20, fontWeight: '700' },
  label: { color: '#344F45', fontSize: 15, fontWeight: '600' },
  input: { backgroundColor: '#F3F6F4', borderWidth: 1, borderColor: '#DCE6DF', borderRadius: 12, padding: 14, fontSize: 17, color: '#17382F', minHeight: 50 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderRadius: 12, backgroundColor: '#F1F5F2', paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  selected: { backgroundColor: '#C5E7D3' }, chipText: { fontSize: 13, color: '#254D3A' },
  button: { backgroundColor: '#19734F', borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 4 }, buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  error: { color: '#AE3030', fontSize: 13 },
  expense: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', padding: 18, borderRadius: 16 }, amountColumn: { alignItems: 'flex-end', flexShrink: 1 }, delete: { minHeight: 44, justifyContent: 'center' },
});

