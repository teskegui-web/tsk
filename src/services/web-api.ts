import Constants from 'expo-constants';
import { authHeaders, supabaseAuthEnabled, supabaseUrl } from './supabase-client';
import { Platform } from 'react-native';
export function apiEndpoint(path: string) {
  if (Platform.OS === 'web' && supabaseAuthEnabled) return `${supabaseUrl}/functions/v1/financial-ai${path}`;
  if (Platform.OS === 'web' && typeof location !== 'undefined') {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    return local ? `http://${location.hostname}:3001${path}` : `/api${path}`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host || host.endsWith('.exp.direct')) throw new Error('Conecte o aplicativo ao servidor na mesma rede Wi-Fi.');
  return `http://${host}:3001${path}`;
}
export async function apiHeaders() {
  if (Platform.OS === 'web' && supabaseAuthEnabled) return authHeaders();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EXPO_PUBLIC_VOICE_TOKEN || ''}` };
}
