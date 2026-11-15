import { VoiceExpense } from '@/components/voice-expense';
import { addExpense, deleteExpense, Expense, loadExpenses } from '@/services/expense-store';
import { Draft } from '@/services/text-expense';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const categories = ['Alimentação', 'Combustível', 'Moradia', 'Lazer', 'Outros'];
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function HomeScreen() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [scope, setScope] = useState('Familiar');
  const [error, setError] = useState('');
  const [lastVoiceExpense, setLastVoiceExpense] = useState<Expense | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void loadExpenses().then(store => { if (active) { setExpenses(store.expenses); setReady(true); } })
      .catch(() => { if (active) setError('Não foi possível carregar os gastos. Feche e abra o app para tentar novamente.'); });
    return () => { active = false; };
  }, []);
  const now = new Date();
  const monthly = expenses.filter(item => {
    const date = new Date(item.createdAt);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const total = monthly.reduce((sum, item) => sum + item.cents, 0);
  const family = monthly.filter(item => item.scope === 'Familiar').reduce((sum, item) => sum + item.cents, 0);

  async function save() {
    if (!ready) { setError('Aguarde o carregamento das despesas.'); return; }
    const normalized = amount.trim().replace(',', '.');
    if (!description.trim()) { setError('Informe uma descrição.'); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) { setError('Use um valor como 20 ou 20,50, sem separador de milhar.'); return; }
    const cents = Math.round(Number(normalized) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000) { setError('Informe um valor entre R$ 0,01 e R$ 1.000.000,00.'); return; }
    try {
      const store = await addExpense({ id: `${Date.now()}-${Math.random()}`, description: description.trim(), cents, category, scope, createdAt: new Date().toISOString() });
      setExpenses(store.expenses); setDescription(''); setAmount(''); setError('');
    } catch { setError('Não foi possível salvar a despesa no aparelho. Tente novamente.'); }
  }

  async function erase(id: string) {
    try { const store = await deleteExpense(id); setExpenses(store.expenses); }
    catch { setError('Não foi possível excluir a despesa. Tente novamente.'); }
  }

  async function saveVoice(draft: Draft, commandId?: string) {
    if (!ready) throw new Error('Aguarde o carregamento das despesas.');
    if (!Number.isSafeInteger(draft.cents) || draft.cents <= 0 || draft.cents > 100000000 ||
        typeof draft.description !== 'string' || !draft.description.trim() ||
        !categories.includes(draft.category) || ![null, 'Pessoal', 'Familiar'].includes(draft.scope)) {
      throw new Error('Não foi possível identificar uma despesa válida. Tente novamente.');
    }
    const expense: Expense = { id: commandId ?? `${Date.now()}-${Math.random()}`, description: draft.description.trim(), cents: draft.cents, category: draft.category, scope: draft.scope ?? scope, createdAt: new Date().toISOString() };
    const store = await addExpense(expense, commandId);
    setExpenses(store.expenses); setLastVoiceExpense(expense);
  }

  function remove(item: Expense) {
    Alert.alert('Excluir despesa?', `${item.description} · ${money(item.cents)}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => { void erase(item.id); } },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <View style={styles.row}><Text style={styles.brand}>Agente TSK</Text><Text style={styles.muted}>PROTÓTIPO</Text></View>
          <Text style={styles.title}>Suas contas, mais claras.</Text>
          <Text style={styles.muted}>Um lugar para organizar os gastos da casa.</Text>
          <View style={styles.summary}>
            <Text style={styles.light}>DESPESAS · {now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}</Text>
            <Text style={styles.total}>{money(total)}</Text>
            <Text style={styles.light}>Familiar: {money(family)} · Pessoal: {money(total - family)}</Text>
          </View>
          <Text style={styles.muted}>{ready ? 'Gastos salvos neste aparelho. O compartilhamento familiar ainda não está ativo.' : 'Carregando despesas…'}</Text>
          <VoiceExpense onDraft={saveVoice} disabled={!ready} />
          {lastVoiceExpense && expenses.some(item => item.id === lastVoiceExpense.id) ? (
            <View style={styles.card}>
              <Text accessibilityLiveRegion="polite" style={styles.label}>
                Adicionado: {money(lastVoiceExpense.cents)} em {lastVoiceExpense.category}
              </Text>
              <Text style={styles.muted}>{lastVoiceExpense.description} · {lastVoiceExpense.scope}</Text>
              <Pressable accessibilityRole="button" style={styles.chip} onPress={() => {
                const id = lastVoiceExpense.id;
                void erase(id);
              }}><Text style={styles.chipText}>Desfazer lançamento por voz</Text></Pressable>
            </View>
          ) : null}
          <View style={styles.card}>
            <Text style={styles.section}>Adicionar despesa</Text>
            <Text style={styles.label}>Descrição</Text>
            <TextInput accessibilityLabel="Descrição do gasto" style={styles.input} placeholder="Ex.: Gasolina" placeholderTextColor="#728078" value={description} onChangeText={setDescription} maxLength={100} />
            <Text style={styles.label}>Valor em reais</Text>
            <TextInput accessibilityLabel="Valor em reais" style={styles.input} placeholder="0,00" placeholderTextColor="#728078" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} maxLength={14} />
            <Text style={styles.label}>Categoria</Text>
            <View style={styles.chips}>{categories.map(value => <Pressable accessibilityRole="button" accessibilityState={{ selected: category === value }} key={value} onPress={() => setCategory(value)} style={[styles.chip, category === value && styles.selected]}><Text style={styles.chipText}>{value}</Text></Pressable>)}</View>
            <Text style={styles.label}>Este gasto é</Text>
            <View style={styles.chips}>{['Pessoal', 'Familiar'].map(value => <Pressable accessibilityRole="button" accessibilityState={{ selected: scope === value }} key={value} onPress={() => setScope(value)} style={[styles.chip, scope === value && styles.selected]}><Text style={styles.chipText}>{value}</Text></Pressable>)}</View>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}><Text style={styles.buttonText}>+ Adicionar gasto</Text></Pressable>
            <Text style={styles.muted}>Confira os dados antes de adicionar o gasto.</Text>
          </View>
          <Text style={styles.section}>Últimos registros</Text>
          {expenses.length === 0 ? <View style={styles.card}><Text style={styles.label}>Seu primeiro gasto começa aqui</Text><Text style={styles.muted}>Adicione uma despesa acima para acompanhar seus totais.</Text></View> : expenses.map(item => <View key={item.id} style={styles.expense}><View style={styles.flex}><Text style={styles.label}>{item.description}</Text><Text style={styles.muted}>{item.category} · {item.scope}</Text><Text style={styles.muted}>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</Text></View><View style={styles.amountColumn}><Text style={styles.label}>{money(item.cents)}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Excluir ${item.description}`} onPress={() => remove(item)} style={styles.delete}><Text style={styles.error}>Excluir</Text></Pressable></View></View>)}
        </ScrollView>
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

