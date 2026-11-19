import { useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { loadExpenses } from '@/services/expense-store';
export function BackupControls() {
  const [message, setMessage] = useState('');
  return <View style={{ padding: 20, backgroundColor: '#FFF', borderRadius: 20, gap: 12 }}><Text style={{ color: '#17382F', fontSize: 20, fontWeight: '700' }}>Migrar meus dados</Text><Text style={{ color: '#586B64', lineHeight: 20 }}>Exporte os dados deste aparelho para importar na versão web. O arquivo contém seus lançamentos e cadastros.</Text><Pressable accessibilityRole="button" style={{ padding: 15, backgroundColor: '#E2EFE7', borderRadius: 12 }} onPress={() => { void loadExpenses().then(store => Share.share({ title: 'Backup Agente Financeiro', message: JSON.stringify(store) })).catch(() => setMessage('Não foi possível exportar os dados.')); }}><Text>Exportar backup</Text></Pressable>{message ? <Text>{message}</Text> : null}</View>;
}
