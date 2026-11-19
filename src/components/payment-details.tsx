import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '@/services/confirm-action';
import type { Expense } from '@/services/expense-store';
import { installmentProgress, localDateKey, paymentGroupLabel } from '@/services/payables';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PaymentDetails({ entries, onClose, onPay, onDelete }: {
  entries: Expense[];
  onClose: () => void;
  onPay: (id: string) => Promise<void>;
  onDelete: (entry: Expense) => void;
}) {
  const first = entries[0];
  const today = localDateKey(new Date());
  if (!first) return null;
  const historicalPayments = first.paymentSeries?.mode === 'installments' ? first.paymentSeries.alreadyPaid : 0;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View accessibilityViewIsModal style={styles.dialog}>
        <View style={styles.row}>
          <Text accessibilityRole="header" style={styles.title}>{first.description}</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={onClose}><Text style={styles.action}>Fechar detalhes</Text></Pressable>
        </View>
        <Text style={styles.muted}>{paymentGroupLabel(first, installmentProgress(entries), entries)}</Text>
        {historicalPayments > 0 ? <Text style={styles.muted}>
          {historicalPayments === 1 ? '1 parcela informada como paga' : historicalPayments + ' parcelas informadas como pagas'} antes do cadastro, sem registro individual.
        </Text> : null}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {entries.map(item => {
            const paid = item.status === 'paid';
            const due = item.dueDate?.split('-').reverse().join('/');
            const series = item.paymentSeries;
            const label = series?.mode === 'installments' ? 'Parcela ' + series.number + ' de ' + series.total : 'Lançamento mensal';
            return <View key={item.id} style={styles.entry}>
              <View style={styles.row}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.label}>{money(item.cents)}</Text>
              </View>
              <Text style={paid ? styles.action : styles.unpaid}>{paid ? 'Pago' : 'Não pago'}{!paid && item.dueDate && item.dueDate < today ? ' · Vencido' : ''}</Text>
              {due ? <Text style={styles.muted}>Vencimento {due}</Text> : null}
              {paid && item.paidAt ? <Text style={styles.muted}>Pago em {new Date(item.paidAt).toLocaleDateString('pt-BR')}</Text> : null}
              <View style={styles.row}>
                {!paid ? <Pressable accessibilityRole="button" accessibilityLabel={'Marcar como pago: ' + label + ' ' + (due ?? '')} style={styles.button}
                  onPress={() => confirmAction('Marcar como pago?', label + ' · ' + money(item.cents), 'Marcar como pago', () => { void onPay(item.id); })}>
                  <Text style={styles.action}>Marcar como pago</Text>
                </Pressable> : null}
                <Pressable accessibilityRole="button" accessibilityLabel={'Excluir ' + label + ' ' + (due ?? '')} style={styles.button} onPress={() => onDelete(item)}>
                  <Text style={styles.remove}>Excluir</Text>
                </Pressable>
              </View>
            </View>;
          })}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(16, 44, 33, 0.6)' },
  dialog: { width: '100%', maxWidth: 580, maxHeight: '88%', backgroundColor: '#FFF', borderRadius: 20, padding: 18, gap: 10 },
  title: { flex: 1, color: '#17382F', fontSize: 21, fontWeight: '700' },
  list: { flexShrink: 1 },
  listContent: { gap: 12, paddingBottom: 6 },
  entry: { backgroundColor: '#F3F6F4', borderRadius: 14, padding: 14, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  button: { paddingHorizontal: 10, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: '#E4EFE8' },
  label: { color: '#17382F', fontWeight: '700' },
  muted: { color: '#586B64', fontSize: 13 },
  action: { color: '#176345', fontWeight: '700' },
  unpaid: { color: '#8A5D1F', fontWeight: '700' },
  remove: { color: '#AE3030', fontWeight: '600' },
});

