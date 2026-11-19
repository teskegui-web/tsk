import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '@/services/confirm-action';
import { Expense, FamilyMember } from '@/services/expense-store';
import { emptySchedule, parseSchedule, PayableScheduleFields } from '@/components/payable-schedule-fields';
import { groupPaymentEntries, installmentProgress, localDateKey, payableSummary, paymentGroupLabel } from '@/services/payables';
import type { PaymentSchedule } from '@/services/payables';
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function PayablesCard({ expenses, members = [], onPay, onDelete, onReplicate, onDetails }: {
  expenses: Expense[];
  members?: FamilyMember[];
  onPay: (id: string) => Promise<void>;
  onDelete: (item: Expense) => void;
  onDetails: (key: string) => void;
  onReplicate: (id: string, schedule: PaymentSchedule) => Promise<void>;
}) {
  const [editing, setEditing] = useState<string>();
  const [fields, setFields] = useState(emptySchedule);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const progress = installmentProgress(expenses);

  function open(item: Expense) {
    setEditing(item.id);
    setFields({ ...emptySchedule, mode: 'monthly' });
    setError('');
  }

  async function replicate(item: Expense) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const schedule = parseSchedule(fields);
      if (!schedule) return;
      await onReplicate(item.id, schedule);
      setEditing(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível replicar a conta.');
    } finally {
      setSaving(false);
    }
  }

  const today = localDateKey(new Date());
  const pending = payableSummary(expenses, today);
  const pendingGroups = groupPaymentEntries(pending.items);
  function pay(item: Expense) {
    confirmAction('Marcar como paga?', `${item.description} · ${money(item.cents)}\nA despesa será registrada como realizada hoje. Isso não faz um pagamento bancário.`, 'Marcar como paga', () => { void onPay(item.id); });
  }
  return <View style={styles.card}><Text style={styles.title}>Contas a pagar</Text><Text style={styles.total}>{money(pending.total)}</Text><Text style={styles.muted}>{pending.items.length} contas pendentes · todos os vencimentos</Text>{pending.overdue > 0 ? <Text style={styles.overdue}>Vencidas: {money(pending.overdue)}</Text> : null}<Text style={styles.muted}>Previsões separadas do saldo realizado. Marque como paga quando efetuar o pagamento.</Text>{pending.items.length ? pendingGroups.map(({ key, entries }) => {
    const [item] = entries;
    if (item.paymentSeries) {
      const subtotal = entries.reduce((sum, entry) => sum + entry.cents, 0);
      return <View key={key} style={styles.item}>
        <View style={styles.row}><Text style={styles.label}>{item.description}</Text><Text style={styles.label}>{money(subtotal)} em aberto</Text></View>
        <Text style={styles.muted}>{item.paymentSeries.mode === 'installments' ? paymentGroupLabel(item, progress, entries) : entries.length + ' em aberto'}</Text>
        <Text style={styles.muted}>Primeiro vencimento em aberto · {item.dueDate?.split('-').reverse().join('/')}</Text>
        <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel={'Detalhar pendências de ' + item.description}
          style={styles.pay} onPress={() => onDetails(key)}><Text style={styles.payText}>Detalhar</Text></Pressable></View>
      </View>;
    }
    const overdue = item.dueDate && item.dueDate < today;
    const label = overdue ? 'Vencida' : item.dueDate === today ? 'Vence hoje' : 'Lançamento futuro';
    return <View key={item.id} style={styles.item}><View style={styles.row}><Text style={styles.label}>{item.description}</Text><Text style={styles.label}>{money(item.cents)}</Text></View><Text style={overdue ? styles.overdue : styles.muted}>{label} · {item.dueDate?.split('-').reverse().join('/') || 'Sem vencimento'}</Text><Text style={styles.muted}>{item.category} · {item.scope} · {members.find(member => member.id === item.memberId)?.name || 'Geral'}</Text><View style={styles.row}><Pressable accessibilityRole="button" style={styles.pay} onPress={() => pay(item)}><Text style={styles.payText}>Marcar como paga</Text></Pressable>{!item.paymentSeries && item.dueDate && editing !== item.id ? <Pressable accessibilityRole="button" disabled={saving} style={styles.pay} onPress={() => open(item)}><Text style={styles.payText}>Replicar conta</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={`Excluir conta ${item.description}`} style={styles.delete} onPress={() => onDelete(item)}><Text style={styles.overdue}>Excluir</Text></Pressable></View>
      {editing === item.id ? <View style={styles.item}>
        <PayableScheduleFields existing value={fields} onChange={setFields} />
        {error ? <Text accessibilityRole="alert" style={styles.overdue}>{error}</Text> : null}
        <View style={styles.row}>
          <Pressable accessibilityRole="button" disabled={saving} style={styles.pay} onPress={() => { void replicate(item); }}><Text style={styles.payText}>{saving ? 'Salvando…' : 'Salvar repetição'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={saving} style={styles.delete} onPress={() => setEditing(undefined)}><Text style={styles.label}>Cancelar</Text></Pressable>
        </View>
      </View> : null}
    </View>;
  }) : <Text style={styles.muted}>Nenhuma conta pendente. Use “Conta a pagar” no formulário abaixo para programar uma despesa.</Text>}</View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, gap: 12 }, title: { color: '#17382F', fontSize: 20, fontWeight: '700' }, total: { color: '#8A5D1F', fontSize: 30, fontWeight: '700' }, muted: { color: '#586B64', fontSize: 13, lineHeight: 20 }, overdue: { color: '#AE3030', fontSize: 13, lineHeight: 20 }, item: { paddingTop: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#E7EEE9' }, row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }, label: { color: '#344F45', fontSize: 15, fontWeight: '600' }, pay: { backgroundColor: '#E1EFE6', padding: 13, borderRadius: 12, minHeight: 44 }, payText: { color: '#19734F', fontWeight: '600' }, delete: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 } });
