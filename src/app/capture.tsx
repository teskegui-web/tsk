import { documentImage } from '@/services/document-image';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { apiEndpoint, apiHeaders } from '@/services/web-api';
import * as ImagePicker from 'expo-image-picker';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { addExpense, Category, FamilyMember, loadExpenses } from '@/services/expense-store';
import { localDateKey, parseDueDate } from '@/services/payables';

type DocumentDraft = { sourceId: string; documentType: 'boleto' | 'receipt'; description: string; cents: number | null; category: string | null; dueDate: string | null; transactionDate: string | null; warning: string };
const displayDate = (date: string) => date.split('-').reverse().join('/');
export default function CaptureScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [draft, setDraft] = useState<DocumentDraft | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [memberId, setMemberId] = useState<string>();
  const [scope, setScope] = useState('Familiar');
  const [scheduled, setScheduled] = useState(true);
  const [dueDate, setDueDate] = useState('');
  const [paidDate, setPaidDate] = useState(displayDate(localDateKey(new Date())));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadExpenses().then(store => { if (active) { setCategories(store.categories.filter(item => item.kind === 'expense' && !item.archived)); setMembers(store.members.filter(item => !item.archived)); setReady(true); } })
      .catch(() => { if (active) { setReady(false); setMessage('Não foi possível carregar os cadastros. Saia desta aba e tente novamente.'); } });
    return () => { active = false; };
  }, []));

  async function pick(camera: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Permita a câmera nos Ajustes do iPhone ou escolha uma foto da galeria.');
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.65, base64: true, exif: false, allowsEditing: false };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = await documentImage(result.assets[0]);
      if (!asset.base64 || asset.base64.length > 6600000) throw new Error('A imagem está muito grande ou não pôde ser lida. Tire outra foto, mais próxima do documento.');
      setPhoto(asset); setDraft(null); setSaved(false); setDescription(''); setAmount(''); setCategoryId(''); setDueDate(''); setMemberId(undefined);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível abrir a câmera.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function read() {
    if (!photo?.base64 || lock.current) return;
    lock.current = true; setBusy(true); setMessage('Lendo valor, descrição e datas…'); setDraft(null);
    try {
const response = await fetch(apiEndpoint('/document'), {
        method: 'POST', headers: await apiHeaders(), signal: AbortSignal.timeout(55000),
        body: JSON.stringify({ image: photo.base64, mimeType: 'image/jpeg', categories: categories.map(item => ({ name: item.name, kind: item.kind })), referenceDate: localDateKey(new Date()) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível ler o documento.');
      if (!data.sourceId || !['boleto', 'receipt'].includes(data.documentType)) throw new Error('Resposta inválida. Fotografe novamente.');
      setDraft(data); setDescription(data.description || ''); setAmount(data.cents ? (data.cents / 100).toFixed(2).replace('.', ',') : '');
      setCategoryId(categories.find(item => item.name === data.category)?.id || '');
      setScheduled(data.documentType === 'boleto');
      setDueDate(data.dueDate ? displayDate(data.dueDate) : '');
      setPaidDate(displayDate(data.transactionDate || localDateKey(new Date())));
      setMessage('Leitura concluída. Confira e corrija os campos antes de confirmar.');
    } catch (error) { setMessage(error instanceof Error && error.message !== 'Network request failed' ? error.message : 'Não consegui acessar o backend. Confira se npm.cmd run voice está rodando.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function save() {
    if (!draft || lock.current || saved) return;
    const normalized = amount.trim().replace(',', '.');
    const cents = Math.round(Number(normalized) * 100);
    const date = parseDueDate(scheduled ? dueDate : paidDate);
    if (!description.trim()) { setMessage('Informe a descrição.'); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000) { setMessage('Informe o valor, como 100 ou 100,50, sem separador de milhar.'); return; }
    if (!date) { setMessage(scheduled ? 'Confira o vencimento no formato DD/MM/AAAA.' : 'Confira a data da despesa no formato DD/MM/AAAA.'); return; }
    if (!scheduled && date > localDateKey(new Date())) { setMessage('Para uma data futura, escolha Conta a pagar.'); return; }
    const category = categories.find(item => item.id === categoryId);
    if (!category) { setMessage('Selecione uma categoria ativa.'); return; }
    lock.current = true; setBusy(true);
    try {
      const current = await loadExpenses();
      if (current.commands.includes(draft.sourceId)) { setSaved(true); setMessage('Esta mesma imagem já foi lançada. Nenhum registro foi duplicado.'); return; }
      const createdAt = scheduled ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
      await addExpense({ id: draft.sourceId, description: description.trim(), cents, category: category.name, categoryId, memberId, scope, kind: 'expense', createdAt, ...(scheduled ? { status: 'scheduled', dueDate: date } : {}) }, draft.sourceId);
      setSaved(true); setMessage(scheduled ? 'Conta a pagar salva. Ela aparece nas pendências do Início.' : 'Despesa salva. O resumo e os relatórios foram atualizados.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Lançar por foto</Text><Text style={styles.muted}>Fotografe um boleto ou cupom fiscal inteiro, com boa luz e sem cortar o valor ou as datas.</Text>
    <View style={styles.row}><Pressable accessibilityRole="button" disabled={busy || !ready} style={styles.button} onPress={() => { void pick(true); }}><Text style={styles.buttonText}>Tirar foto</Text></Pressable><Pressable accessibilityRole="button" disabled={busy || !ready} style={styles.chip} onPress={() => { void pick(false); }}><Text style={styles.label}>Escolher foto</Text></Pressable></View>
    {photo ? <><Image accessibilityLabel="Documento selecionado para leitura" source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" /><Text style={styles.note}>Ao tocar em Ler documento, esta imagem e suas categorias serão enviadas ao Google Gemini. Na faixa gratuita, o conteúdo pode ser usado para melhorar os produtos do Google. A foto não será anexada ao lançamento.</Text><Pressable accessibilityRole="button" disabled={busy || saved} style={styles.button} onPress={() => { void read(); }}><Text style={styles.buttonText}>{busy ? 'Processando…' : 'Ler documento'}</Text></Pressable></> : null}
    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    {draft ? <View style={styles.card}><Text style={styles.section}>Revisar lançamento</Text><Text style={styles.muted}>Identificado: {draft.documentType === 'boleto' ? 'boleto — não comprova pagamento' : 'cupom fiscal'}</Text>{draft.warning ? <Text style={styles.warning}>{draft.warning}</Text> : null}
      <View style={styles.row}>{[true, false].map(value => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: scheduled === value }} disabled={busy || saved} style={[styles.chip, scheduled === value && styles.selected]} onPress={() => setScheduled(value)}><Text style={styles.label}>{value ? 'Conta a pagar' : 'Despesa realizada'}</Text></Pressable>)}</View>
      <Text style={styles.label}>Descrição</Text><TextInput accessibilityLabel="Descrição do documento" editable={!busy && !saved} style={styles.input} value={description} onChangeText={setDescription} maxLength={100} />
      <Text style={styles.label}>Valor em reais</Text><TextInput accessibilityLabel="Valor do documento" editable={!busy && !saved} style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={14} />
      <Text style={styles.label}>{scheduled ? 'Vencimento (DD/MM/AAAA)' : 'Data da despesa (DD/MM/AAAA)'}</Text><TextInput accessibilityLabel={scheduled ? 'Vencimento do documento' : 'Data da despesa'} editable={!busy && !saved} style={styles.input} placeholder="DD/MM/AAAA" placeholderTextColor="#728078" value={scheduled ? dueDate : paidDate} onChangeText={scheduled ? setDueDate : setPaidDate} keyboardType="numbers-and-punctuation" maxLength={10} />
      {!scheduled && !draft.transactionDate ? <Text style={styles.warning}>Data da compra não identificada: sugerimos hoje. Confira no documento.</Text> : null}
      <Text style={styles.label}>Categoria</Text><View style={styles.row}>{categories.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: categoryId === item.id }} disabled={busy || saved} style={[styles.chip, categoryId === item.id && styles.selected]} onPress={() => setCategoryId(item.id)}><Text style={styles.label}>{item.name}</Text></Pressable>)}</View>
      <Text style={styles.label}>Tipo</Text><View style={styles.row}>{['Pessoal', 'Familiar'].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: scope === value }} disabled={busy || saved} style={[styles.chip, scope === value && styles.selected]} onPress={() => setScope(value)}><Text>{value}</Text></Pressable>)}</View>
      <Text style={styles.label}>Membro</Text><View style={styles.row}>{[{ id: '', name: 'Geral / sem membro' }, ...members].map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: (memberId || '') === item.id }} disabled={busy || saved} style={[styles.chip, (memberId || '') === item.id && styles.selected]} onPress={() => setMemberId(item.id || undefined)}><Text>{item.name}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" disabled={busy || saved} style={[styles.button, (busy || saved) && { opacity: 0.5 }]} onPress={() => { void save(); }}><Text style={styles.buttonText}>{saved ? 'Lançamento concluído' : scheduled ? 'Confirmar conta a pagar' : 'Confirmar despesa'}</Text></Pressable>
      <Text style={styles.note}>Isso registra o lançamento no app. Nenhum pagamento bancário é executado.</Text>
    </View> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F4F7F5' }, content: { padding: 24, paddingBottom: 120, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' }, title: { color: '#17382F', fontSize: 30, fontWeight: '700' }, section: { color: '#17382F', fontSize: 20, fontWeight: '700' }, card: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, gap: 12 }, muted: { color: '#586B64', fontSize: 13, lineHeight: 20 }, note: { color: '#65766D', fontSize: 11, lineHeight: 18 }, label: { color: '#344F45', fontSize: 14, fontWeight: '600' }, message: { color: '#19734F', lineHeight: 22 }, warning: { color: '#8A5D1F', fontSize: 13, lineHeight: 20 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { backgroundColor: '#19734F', borderRadius: 14, padding: 17, minHeight: 48 }, buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '700' }, chip: { backgroundColor: '#E7EEE9', borderRadius: 12, padding: 13, minHeight: 44, justifyContent: 'center' }, selected: { backgroundColor: '#BCE0CA' }, input: { backgroundColor: '#F3F6F4', borderColor: '#DCE6DF', borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 17, color: '#17382F' }, preview: { width: '100%', height: 280, borderRadius: 16, backgroundColor: '#E7EEE9' } });
