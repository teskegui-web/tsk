import { Platform, StyleSheet, Text, View } from 'react-native';
import { familyTotals } from '@/services/finance-family';
import type { Family } from '@/services/finance-family';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const chartColors = [
  '#176345', '#397FBA', '#A55A21', '#7753A1', '#177D81', '#AE4265',
  '#617128', '#9B6212', '#575CC1', '#854E40', '#53707B', '#8A4E86',
];

type ChartSlice = { id: string; label: string; color: string; cents: number };

function FamilyPie({ title, slices }: { title: string; slices: ChartSlice[] }) {
  const populated = slices.filter(slice => slice.cents > 0);
  const total = populated.reduce((sum, slice) => sum + slice.cents, 0);
  let cumulative = 0;
  const segments: string[] = [];
  for (const slice of populated) {
    const start = (cumulative / total) * 100;
    cumulative += slice.cents;
    const end = (cumulative / total) * 100;
    segments.push(slice.color + ' ' + start + '% ' + end + '%');
  }

  return <View style={styles.card}>
    <Text style={styles.section}>{title}</Text>
    {total === 0 ? <Text style={styles.muted}>Sem valores registrados neste mês para as contas selecionadas.</Text> : <>
      {Platform.OS === 'web' ? <div aria-hidden="true" style={{
        width: 'min(180px, 100%)',
        aspectRatio: '1',
        borderRadius: '50%',
        margin: '0 auto',
        background: 'conic-gradient(' + segments.join(', ') + ')',
      }} /> : null}
      {populated.map(slice => <View key={slice.id} style={styles.legendRow}>
        <View accessible={false} style={[styles.legendDot, { backgroundColor: slice.color }]} />
        <View style={styles.entry}>
          <Text style={styles.muted}>{slice.label}</Text>
          <Text>{money(slice.cents)} · {(slice.cents / total).toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 })}</Text>
        </View>
      </View>)}
    </>}
  </View>;
}

export function FamilyCharts({ members, selected }: { members: Family['members']; selected?: string }) {
  const accounts = members.map((member, index) => ({
    id: member.id,
    label: member.self ? 'Minha conta' : member.name,
    color: chartColors[index % chartColors.length],
    ...familyTotals(member.entries),
  })).filter(account => !selected || account.id === selected);

  return <View style={styles.grid}>
    <FamilyPie title="Receitas por conta" slices={accounts.map(({ income, ...account }) => ({ ...account, cents: income }))} />
    <FamilyPie title="Despesas por conta" slices={accounts.map(({ expense, ...account }) => ({ ...account, cents: expense }))} />
  </View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { backgroundColor: '#FFF', padding: 18, borderRadius: 18, gap: 12, flexGrow: 1, flexBasis: 245, minWidth: 0 },
  section: { color: '#17382F', fontSize: 19, fontWeight: '700' },
  muted: { color: '#586B64', lineHeight: 20 },
  entry: { flex: 1, minWidth: 0 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
});
