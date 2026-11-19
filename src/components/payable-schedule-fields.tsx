import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { maxPaymentMonths } from '@/services/payables';
import type { PaymentSchedule } from '@/services/payables';

export type ScheduleFields = { mode: 'single' | PaymentSchedule['mode']; months: string; total: string; paid: string };
export const emptySchedule: ScheduleFields = { mode: 'single', months: '', total: '', paid: '0' };

export function parseSchedule(fields: ScheduleFields): PaymentSchedule | undefined {
  if (fields.mode === 'single') return undefined;
  const integer = (value: string) => /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (fields.mode === 'monthly') {
    const additionalMonths = integer(fields.months);
    if (!Number.isInteger(additionalMonths) || additionalMonths < 1 || additionalMonths > maxPaymentMonths) {
      throw new Error('Informe de 1 a 120 meses adicionais.');
    }
    return { mode: 'monthly', additionalMonths };
  }
  const total = integer(fields.total);
  const alreadyPaid = integer(fields.paid);
  if (!Number.isInteger(total) || total < 2 || total > maxPaymentMonths ||
      !Number.isInteger(alreadyPaid) || alreadyPaid < 0 || alreadyPaid >= total) {
    throw new Error('Informe de 2 a 120 parcelas no total e quantas já foram pagas. Deixe pelo menos uma em aberto.');
  }
  return { mode: 'installments', total, alreadyPaid };
}

const options = [
  { mode: 'single', label: 'Avulsa / Pix' },
  { mode: 'monthly', label: 'Repetir por mês' },
  { mode: 'installments', label: 'Carnê / Parcelada' },
] as const;

export function PayableScheduleFields({ value, onChange, existing = false }: {
  value: ScheduleFields; onChange: (value: ScheduleFields) => void; existing?: boolean;
}) {
  return <View style={styles.fields}>
    <Text style={styles.label}>{existing ? 'Como replicar esta conta?' : 'Tipo de conta a pagar'}</Text>
    <View style={styles.options}>
      {options.filter(option => !existing || option.mode !== 'single').map(option =>
        <Pressable key={option.mode} accessibilityRole="button" accessibilityState={{ selected: option.mode === value.mode }}
          style={[styles.option, option.mode === value.mode && styles.selected]} onPress={() => onChange({ ...value, mode: option.mode })}>
          <Text style={styles.label}>{option.label}</Text>
        </Pressable>,
      )}
    </View>
    {value.mode === 'monthly' ? <>
      <Text style={styles.label}>Quantos meses adicionais?</Text>
      <TextInput accessibilityLabel="Meses adicionais" style={styles.input} keyboardType="number-pad" maxLength={3} value={value.months} onChangeText={months => onChange({ ...value, months })} />
      <Text style={styles.muted}>O app cria uma cópia com o mesmo valor em cada mês adicional.</Text>
    </> : null}
    {value.mode === 'installments' ? <>
      <Text style={styles.label}>Total de parcelas</Text>
      <TextInput accessibilityLabel="Total de parcelas" style={styles.input} keyboardType="number-pad" maxLength={3} value={value.total} onChangeText={total => onChange({ ...value, total })} />
      <Text style={styles.label}>Parcelas já pagas</Text>
      <TextInput accessibilityLabel="Parcelas já pagas" style={styles.input} keyboardType="number-pad" maxLength={3} value={value.paid} onChangeText={paid => onChange({ ...value, paid })} />
      <Text style={styles.muted}>{existing ? 'O vencimento desta conta será o da primeira parcela em aberto.' : 'Informe acima o valor de uma parcela e o vencimento da primeira que falta pagar.'} As parcelas já pagas entram apenas na contagem.</Text>
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  fields: { gap: 8 },
  label: { color: '#344F45', fontWeight: '600' },
  muted: { color: '#586B64', lineHeight: 20, fontSize: 13 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#F1F5F2', borderRadius: 12 },
  selected: { backgroundColor: '#C5E7D3' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#DCE6DF', borderRadius: 12, backgroundColor: '#F3F6F4', paddingHorizontal: 12, color: '#17382F' },
});

