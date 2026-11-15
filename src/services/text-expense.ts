import Constants from 'expo-constants';
export type Draft = { transcript: string; description: string; cents: number; category: string; scope: string | null };
export async function interpretText(text: string): Promise<Draft> {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host || host.endsWith('.exp.direct')) throw new Error('Conecte a build de desenvolvimento ao Expo pela rede Wi-Fi local.');
  const response = await fetch(`http://${host}:3001/voice`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EXPO_PUBLIC_VOICE_TOKEN || ''}` },
    body: JSON.stringify({ text }), signal: AbortSignal.timeout(55000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível interpretar o gasto.');
  return data;
}
