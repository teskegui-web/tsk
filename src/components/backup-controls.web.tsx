import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { importBackup, loadExpenses } from '@/services/expense-store';
export function BackupControls() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function exportData() {
    try { const store = await loadExpenses(); const url = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'agente-financeiro-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch { setMessage('Não foi possível exportar. Tente novamente.'); }
  }
  async function importFile(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    try {
      if (file.size > 1500000) throw new Error('Arquivo muito grande.');
      const data = JSON.parse(await file.text());
      if (!window.confirm('Importar os dados deste backup para a conta atual? A conta precisa estar vazia.')) return;
      await importBackup(data); setMessage('Backup importado. Abra novamente as abas para carregar os dados.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Backup inválido.'); }
    finally { setBusy(false); }
  }
  return <View style={{ padding: 20, backgroundColor: '#FFF', borderRadius: 20, gap: 12 }}><Text style={{ color: '#17382F', fontSize: 20, fontWeight: '700' }}>Backup e migração</Text><Text style={{ color: '#586B64', lineHeight: 20 }}>Exporte uma cópia ou importe um backup do aplicativo em uma conta vazia.</Text><Pressable accessibilityRole="button" style={{ padding: 15, backgroundColor: '#E2EFE7', borderRadius: 12 }} onPress={() => { void exportData(); }}><Text>Baixar backup JSON</Text></Pressable><label style={{ color: '#344F45', fontSize: 14 }}>Importar backup JSON<input aria-label="Importar backup JSON" type="file" accept="application/json,.json" disabled={busy} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} style={{ display: 'block', marginTop: 10, maxWidth: '100%' }} /></label>{message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}</View>;
}
