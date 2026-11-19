import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { archiveRegistration, Category, FamilyMember, loadExpenses, saveCategory, saveMember } from '@/services/expense-store';
import { BackupControls } from '@/components/backup-controls';

export default function RegistrationsScreen() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [memberId, setMemberId] = useState<string>();
  const [categoryName, setCategoryName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [categoryId, setCategoryId] = useState<string>();
  const [archived, setArchived] = useState(false);
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadExpenses().then(store => { if (active) { setMembers(store.members); setCategories(store.categories); setReady(true); } })
      .catch(() => { if (active) { setReady(false); setMessage('Não foi possível carregar os cadastros. Tente novamente.'); } });
    return () => { active = false; };
    // revision permite refazer a leitura após erro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]));
  async function apply(action: () => ReturnType<typeof loadExpenses>, success: string, clear?: () => void) {
    if (busy || !ready) return;
    setBusy(true); setMessage('');
    try { const store = await action(); setMembers(store.members); setCategories(store.categories); clear?.(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Cadastros</Text><Text style={styles.muted}>Organize categorias e pessoas da sua família. São perfis locais, sem conta de acesso ou convite.</Text>
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    {!ready ? <Pressable accessibilityRole="button" style={styles.chip} onPress={() => setRevision(value => value + 1)}><Text>Carregar cadastros novamente</Text></Pressable> : null}
    <View style={styles.card}><Text style={styles.section}>{memberId ? 'Editar membro' : 'Novo membro familiar'}</Text>
      <Text style={styles.label}>Nome</Text><TextInput accessibilityLabel="Nome do membro" style={styles.input} placeholder="Ex.: Gabriel, Maria, Mamãe ou Pai" placeholderTextColor="#728078" maxLength={50} value={name} onChangeText={setName} />
      <Text style={styles.label}>Parentesco ou identificação (opcional)</Text><TextInput accessibilityLabel="Parentesco do membro" style={styles.input} placeholder="Ex.: Filho, Filha, Mãe, Pai" placeholderTextColor="#728078" maxLength={40} value={role} onChangeText={setRole} />
      <Pressable accessibilityRole="button" disabled={!ready || busy} style={styles.button} onPress={() => { void apply(() => saveMember(name, role, memberId), 'Membro salvo.', () => { setName(''); setRole(''); setMemberId(undefined); }); }}><Text style={styles.buttonText}>{memberId ? 'Salvar alterações' : 'Adicionar membro'}</Text></Pressable>
      {memberId ? <Pressable accessibilityRole="button" style={styles.chip} onPress={() => { setMemberId(undefined); setName(''); setRole(''); }}><Text>Cancelar edição</Text></Pressable> : null}
    </View>
    <View style={styles.card}><Text style={styles.section}>{categoryId ? 'Editar categoria' : 'Nova categoria'}</Text>
      <View style={styles.row}>{(['expense', 'income'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: kind === value }} disabled={!!categoryId} style={[styles.chip, kind === value && styles.selected]} onPress={() => setKind(value)}><Text style={styles.label}>{value === 'expense' ? 'Despesa' : 'Receita'}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="Nome da categoria" style={styles.input} placeholder="Ex.: Escola, Balé, Pilates, Beach tênis" placeholderTextColor="#728078" maxLength={50} value={categoryName} onChangeText={setCategoryName} />
      <Pressable accessibilityRole="button" disabled={!ready || busy} style={styles.button} onPress={() => { void apply(() => saveCategory(categoryName, kind, categoryId), 'Categoria salva.', () => { setCategoryName(''); setCategoryId(undefined); }); }}><Text style={styles.buttonText}>{categoryId ? 'Salvar alterações' : 'Adicionar categoria'}</Text></Pressable>
      {categoryId ? <Pressable accessibilityRole="button" style={styles.chip} onPress={() => { setCategoryId(undefined); setCategoryName(''); }}><Text>Cancelar edição</Text></Pressable> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: archived }} style={styles.chip} onPress={() => setArchived(value => !value)}><Text style={styles.label}>{archived ? 'Ocultar arquivados' : 'Mostrar arquivados'}</Text></Pressable>
    <View style={styles.card}><Text style={styles.section}>Membros da família</Text>{members.filter(item => archived || !item.archived).map(item => <View key={item.id} style={styles.entry}><Text style={styles.label}>{item.name}{item.archived ? ' · Arquivado' : ''}</Text><Text style={styles.muted}>{item.role || 'Sem parentesco informado'}</Text><View style={styles.row}><Pressable accessibilityRole="button" style={styles.chip} onPress={() => { setMemberId(item.id); setName(item.name); setRole(item.role); setMessage('Edite o membro no formulário acima.'); }}><Text>Editar</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} style={styles.chip} onPress={() => { void apply(() => archiveRegistration('member', item.id, !item.archived), item.archived ? 'Membro restaurado.' : 'Membro arquivado. Os lançamentos anteriores foram mantidos.'); }}><Text>{item.archived ? 'Restaurar' : 'Arquivar'}</Text></Pressable></View></View>)}{!members.length ? <Text style={styles.muted}>Cadastre os membros para separar os lançamentos por pessoa.</Text> : null}</View>
    <View style={styles.card}><Text style={styles.section}>Categorias</Text>{categories.filter(item => archived || !item.archived).map(item => <View key={item.id} style={styles.entry}><Text style={styles.label}>{item.name}{item.archived ? ' · Arquivada' : ''}</Text><Text style={styles.muted}>{item.kind === 'income' ? 'Receita' : 'Despesa'}</Text><View style={styles.row}><Pressable accessibilityRole="button" style={styles.chip} onPress={() => { setCategoryId(item.id); setCategoryName(item.name); setKind(item.kind); setMessage('Edite a categoria no formulário acima.'); }}><Text>Editar</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} style={styles.chip} onPress={() => { void apply(() => archiveRegistration('category', item.id, !item.archived), item.archived ? 'Categoria restaurada.' : 'Categoria arquivada. Os lançamentos anteriores foram mantidos.'); }}><Text>{item.archived ? 'Restaurar' : 'Arquivar'}</Text></Pressable></View></View>)}</View>
    <BackupControls />
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F4F7F5' }, content: { padding: 24, paddingBottom: 120, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' }, title: { color: '#17382F', fontSize: 30, fontWeight: '700' }, section: { color: '#17382F', fontSize: 20, fontWeight: '700' }, card: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, gap: 12 }, label: { color: '#344F45', fontSize: 14, fontWeight: '600' }, muted: { color: '#586B64', fontSize: 13, lineHeight: 20 }, message: { color: '#19734F', lineHeight: 21 }, input: { backgroundColor: '#F3F6F4', borderWidth: 1, borderColor: '#DCE6DF', padding: 14, borderRadius: 12, fontSize: 16, color: '#17382F' }, button: { backgroundColor: '#19734F', borderRadius: 14, padding: 17 }, buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '700' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { backgroundColor: '#EDF2EE', padding: 13, borderRadius: 12, minHeight: 44 }, selected: { backgroundColor: '#C5E7D3' }, entry: { borderTopWidth: 1, borderTopColor: '#E7EEE9', paddingTop: 14, gap: 8 } });
