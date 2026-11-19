import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FamilyCharts } from '@/components/family-charts';
import { familyMonth, loadFamily } from '@/services/finance-family';
import type { Family } from '@/services/finance-family';
import { supabaseAuthEnabled } from '@/services/supabase-client';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Expense, FamilyMember, loadExpenses } from '@/services/expense-store';
import { buildReport, monthDate, ReportScope } from '@/services/reports';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const scopes: ReportScope[] = ['Todos', 'Pessoal', 'Familiar'];
const colors = ['#26754F', '#449575', '#76AF92', '#A0C4AB', '#C1D9C6'];

function FamilyReportCharts({ month }: { month: string }) {
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void loadFamily(month)
      .then(result => { if (active) setFamily(result); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]));

  if (loading) return <Text style={styles.muted}>Carregando gráficos da família…</Text>;
  if (error) return <Text accessibilityRole="alert" style={styles.error}>Não foi possível carregar os gráficos da família. Atualize para tentar novamente.</Text>;
  if (!family?.joined) return null;

  return <>
    <Text style={styles.section}>Consolidado da família</Text>
    <FamilyCharts members={family.members} />
  </>;
}

export default function ReportsScreen() {
  const [selected, setSelected] = useState(() => monthDate(new Date().getFullYear(), new Date().getMonth()));
  const [scope, setScope] = useState<ReportScope>('Todos');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [memberId, setMemberId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    void loadExpenses().then(store => { if (active) { setExpenses(store.expenses); setMembers(store.members); } })
      .catch(() => { if (active) setError('Não foi possível carregar as despesas. Tente novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // revision força uma nova leitura ao puxar para atualizar ou tentar novamente.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]));
  const month = familyMonth(selected);
  const now = new Date();
  const currentMonth = selected.getFullYear() === now.getFullYear() && selected.getMonth() === now.getMonth();
  const report = buildReport(expenses, selected.getFullYear(), selected.getMonth(), scope, memberId);
  const trendMax = Math.max(1, ...report.trend.map(item => item.total));
  const monthLabel = selected.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const previousLabel = monthDate(selected.getFullYear(), selected.getMonth(), -1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  function move(offset: number) { setSelected(date => monthDate(date.getFullYear(), date.getMonth(), offset)); }
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => setRevision(value => value + 1)} tintColor="#19734F" />}>
        <Text style={styles.eyebrow}>AGENTE FINANCEIRO</Text>
        <Text style={styles.title}>Relatórios</Text>
        <Text style={styles.muted}>Entenda como seus gastos se distribuem.</Text>
        <View style={styles.monthPicker}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" style={styles.arrow} onPress={() => move(-1)}><Text style={styles.arrowText}>‹</Text></Pressable>
          <Text style={styles.month}>{monthLabel}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" style={styles.arrow} onPress={() => move(1)}><Text style={styles.arrowText}>›</Text></Pressable>
        </View>
        {supabaseAuthEnabled ? <FamilyReportCharts key={month + ':' + revision} month={month} /> : null}
        <View style={styles.filters}>{scopes.map(value => <Pressable accessibilityRole="button" accessibilityState={{ selected: scope === value }} key={value} style={[styles.filter, scope === value && styles.activeFilter]} onPress={() => setScope(value)}><Text style={[styles.filterText, scope === value && styles.activeText]}>{value}</Text></Pressable>)}</View>
        <Text style={styles.label}>Membro da família</Text>
        <View style={styles.filters}>{[{ id: '', name: 'Todos os membros' }, { id: 'unassigned', name: 'Geral / sem membro' }, ...members.map(item => ({ id: item.id, name: `${item.name}${item.archived ? ' (arquivado)' : ''}` }))].map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: (memberId || '') === item.id }} style={[styles.filter, (memberId || '') === item.id && styles.activeFilter]} onPress={() => setMemberId(item.id || undefined)}><Text style={[styles.filterText, (memberId || '') === item.id && styles.activeText]}>{item.name}</Text></Pressable>)}</View>
        {loading ? <View style={styles.card}><ActivityIndicator color="#19734F" /><Text style={styles.muted}>Carregando relatório…</Text></View> : error ? <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" style={styles.filter} onPress={() => setRevision(value => value + 1)}><Text style={styles.filterText}>Tentar novamente</Text></Pressable></View> : <>
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>SALDO REGISTRADO NO MÊS</Text>
            <Text style={styles.total}>{money(report.balance)}</Text>
            <Text style={styles.heroLabel}>Receitas {money(report.income.total)} · Despesas {money(report.total)}</Text>
            <Text style={styles.heroLabel}>{currentMonth ? `Mês em andamento · até ${now.toLocaleDateString('pt-BR')}` : 'Total registrado no mês'}</Text>
          </View>
          <View style={styles.metrics}>
            <View style={[styles.card, styles.metric]}><Text style={styles.muted}>Despesas</Text><Text style={styles.metricValue}>{report.count}</Text></View>
            <View style={[styles.card, styles.metric]}><Text style={styles.muted}>Receitas</Text><Text style={styles.metricValue}>{report.income.count}</Text></View>
          </View>
          <View style={styles.card}>
            <Text style={styles.section}>Contas a pagar no mês</Text>
            <Text style={styles.metricValue}>{money(report.pendingTotal)}</Text>
            <Text style={styles.muted}>{report.pendingCount} contas pendentes com vencimento em {monthLabel}, no filtro selecionado.</Text>
            <Text style={styles.label}>Saldo após essas contas: {money(report.projectedBalance)}</Text>
            <Text style={styles.note}>Projeção sobre receitas e despesas já realizadas. Não inclui contas vencidas em outros meses nem receitas futuras.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.section}>Comparação de despesas</Text>
            <Text style={styles.muted}>{previousLabel}: {money(report.previousTotal)}</Text>
            <Text style={styles.comparison}>{report.changePercent === null ? 'Sem base para comparação percentual' : report.difference === 0 ? 'Mesmo total do mês anterior' : `${Math.abs(report.changePercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% ${report.difference > 0 ? 'a mais' : 'a menos'}`}</Text>
            {report.difference !== 0 ? <Text style={styles.muted}>Diferença: {report.difference > 0 ? '+' : '−'} {money(Math.abs(report.difference))}</Text> : null}
            <Text style={styles.note}>{currentMonth ? 'Compara o mês atual em andamento com o total do mês anterior. Não é uma projeção.' : 'Compara os totais registrados nos dois meses.'}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.section}>Despesas por categoria</Text>
            {report.categories.length ? report.categories.map((item, index) => <View key={item.name} style={styles.category}>
              <View style={styles.row}><Text style={styles.label}>{item.name}</Text><Text style={styles.label}>{money(item.cents)}</Text></View>
              <View accessibilityRole="image" accessibilityLabel={`${item.name}: ${Math.round(item.share * 100)} por cento do total`} style={styles.track}><View style={[styles.bar, { width: `${item.share * 100}%`, backgroundColor: colors[index % colors.length] }]} /></View>
              <Text style={styles.note}>{(item.share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do total · {item.count} {item.count === 1 ? 'gasto' : 'gastos'}</Text>
            </View>) : <Text style={styles.muted}>Nenhuma despesa neste mês com o filtro selecionado. Adicione um gasto na aba Início ou escolha outro mês.</Text>}
          </View>
          <View style={styles.card}>
            <Text style={styles.section}>Receitas por categoria</Text>
            {report.income.categories.length ? report.income.categories.map((item, index) => <View key={item.name} style={styles.category}>
              <View style={styles.row}><Text style={styles.label}>{item.name}</Text><Text style={styles.label}>{money(item.cents)}</Text></View>
              <View accessibilityRole="image" accessibilityLabel={`${item.name}: ${Math.round(item.share * 100)} por cento das receitas`} style={styles.track}><View style={[styles.bar, { width: `${item.share * 100}%`, backgroundColor: colors[index % colors.length] }]} /></View>
              <Text style={styles.note}>{(item.share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das receitas · {item.count} {item.count === 1 ? 'entrada' : 'entradas'}</Text>
            </View>) : <Text style={styles.muted}>Nenhuma receita no período e filtro selecionados.</Text>}
            <Text style={styles.note}>O saldo é receitas menos despesas, sem saldo inicial. Inclui benefícios de uso restrito, como vale-alimentação; não representa somente dinheiro disponível em conta.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.section}>Últimos seis meses</Text>
            <Text style={styles.note}>Totais mensais até {monthLabel}, no mesmo filtro.</Text>
            {report.trend.map(item => <View key={item.date.toISOString()} style={styles.category}>
              <View style={styles.row}><Text style={styles.muted}>{item.date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</Text><Text style={styles.label}>{money(item.total)}</Text></View>
              <Text style={styles.note}>Despesas acima · Receitas {money(item.income)} · Saldo {money(item.balance)}</Text>
              <View accessibilityRole="image" accessibilityLabel={`${item.date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}: ${money(item.total)}`} style={styles.track}><View style={[styles.bar, { width: `${item.total / trendMax * 100}%`, backgroundColor: '#449575' }]} /></View>
            </View>)}
          </View>
          <Text style={styles.note}>Baseado nos gastos salvos neste aparelho e na data local do lançamento. Puxe para baixo para atualizar.</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7F5' }, content: { padding: 24, paddingBottom: 120, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' },
  eyebrow: { color: '#19734F', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, title: { color: '#17382F', fontSize: 32, fontWeight: '700' }, muted: { color: '#586B64', fontSize: 13, lineHeight: 20 },
  monthPicker: { flexDirection: 'row', alignItems: 'center', gap: 8 }, month: { flex: 1, textAlign: 'center', color: '#17382F', fontSize: 17, fontWeight: '600', textTransform: 'capitalize' }, arrow: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3EDE6', borderRadius: 14 }, arrowText: { color: '#19734F', fontSize: 32 }, disabled: { opacity: 0.3 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, filter: { paddingHorizontal: 18, paddingVertical: 13, backgroundColor: '#E7EEE9', borderRadius: 12, minHeight: 44 }, activeFilter: { backgroundColor: '#19734F' }, filterText: { color: '#344F45', fontWeight: '600' }, activeText: { color: '#FFF' },
  hero: { backgroundColor: '#153F34', padding: 24, borderRadius: 24, gap: 14 }, heroLabel: { color: '#CEE7DC', fontSize: 12, lineHeight: 19 }, total: { color: '#FFF', fontSize: 38, fontWeight: '700' }, metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, metric: { flex: 1, minWidth: 130 }, metricValue: { fontSize: 23, color: '#17382F', fontWeight: '700' },
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 20, gap: 12 }, section: { color: '#17382F', fontSize: 19, fontWeight: '700' }, comparison: { color: '#17382F', fontSize: 20, fontWeight: '600' }, note: { color: '#65766D', fontSize: 11, lineHeight: 18 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, label: { color: '#344F45', fontWeight: '600', fontSize: 14 }, category: { gap: 8, paddingTop: 6 }, track: { height: 10, borderRadius: 5, backgroundColor: '#EDF2EE', overflow: 'hidden' }, bar: { height: 10, borderRadius: 5 }, error: { color: '#AE3030', lineHeight: 20 },
});
