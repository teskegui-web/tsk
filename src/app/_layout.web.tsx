import { DefaultTheme, ThemeProvider } from 'expo-router';
import { useEffect } from 'react';
import AppTabs from '@/components/app-tabs';
import { AuthGate } from '@/components/auth-gate.web';
import { supabaseAuthEnabled } from '@/services/supabase-client';
export default function WebLayout() {
  useEffect(() => { if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) void navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);
  return <ThemeProvider value={DefaultTheme}>{supabaseAuthEnabled ? <AuthGate><AppTabs /></AuthGate> : <AppTabs />}</ThemeProvider>;
}
