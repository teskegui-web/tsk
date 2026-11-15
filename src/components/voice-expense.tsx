import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';

type Draft = { transcript: string; description: string; cents: number; category: string; scope: string | null };
export function VoiceExpense({ onDraft, disabled = false, onBusyChange }: { onDraft: (draft: Draft) => Promise<void>; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'busy'>('idle');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recording = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { onBusyChange?.(phase !== 'idle'); }, [phase, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && recording.current) {
        recording.current = false;
        if (timer.current) clearTimeout(timer.current);
        void recorder.stop().catch(() => {}).finally(() => { void setAudioModeAsync({ allowsRecording: false }); });
        setPhase('idle'); setMessage('Gravação cancelada ao sair do app.');
      }
    });
    return () => { mounted.current = false; subscription.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [recorder]);

  async function finish() {
    if (lock.current || !recording.current) return;
    lock.current = true; recording.current = false;
    if (timer.current) clearTimeout(timer.current);
    setPhase('busy'); setMessage('Interpretando sua fala…');
    let file: File | undefined;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (!recorder.uri) throw new Error('Não foi possível obter o áudio.');
      file = new File(recorder.uri);
      if (file.size > 2000000) throw new Error('Áudio muito grande. Tente uma frase curta.');
      const host = Constants.expoConfig?.hostUri?.split(':')[0];
      if (!host || host.endsWith('.exp.direct')) throw new Error('Use o Expo pela rede Wi-Fi local para conectar ao backend.');
      const response = await fetch(`http://${host}:3001/voice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EXPO_PUBLIC_VOICE_TOKEN || ''}` },
        body: JSON.stringify({ audio: await file.base64(), mimeType: 'audio/mp4' }), signal: AbortSignal.timeout(55000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível interpretar o áudio.');
      if (mounted.current) { await onDraft(data); setMessage(`Ouvi: “${data.transcript}”`); }
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error && error.message !== 'Network request failed' ? error.message : 'Não consegui acessar o backend. Confira se npm.cmd run voice está rodando e se o Firewall permite a porta 3001 na rede privada.');
    } finally {
      if (file?.exists) { try { file.delete(); } catch {} }
      lock.current = false;
      if (mounted.current) setPhase('idle');
    }
  }

  async function start() {
    if (lock.current) return;
    lock.current = true;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Permita o microfone nos Ajustes do iPhone para usar voz.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record(); recording.current = true;
      setPhase('recording'); setMessage('Ouvindo… toque em Parar e interpretar quando terminar.');
      timer.current = setTimeout(() => { void finish(); }, 20000);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar o microfone.'); }
    finally { lock.current = false; }
  }

  function press() {
    if (phase === 'recording') { void finish(); return; }
    Alert.alert('Registrar por voz', 'A despesa identificada será adicionada automaticamente, com opção de desfazer. O áudio será enviado ao Google Gemini. Na faixa gratuita, o Google pode usar o conteúdo para melhorar seus produtos. Use gastos fictícios nos testes.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Gravar', onPress: () => { void start(); } }]);
  }

  if (Platform.OS === 'web') return <Text>O registro de voz desta versão está disponível no iPhone.</Text>;
  return <View style={styles.card}><Text style={styles.title}>Fale seu gasto</Text><Text style={styles.hint}>Ex.: “Gastei vinte reais em gasolina”. Uma despesa de hoje por vez.</Text><Pressable accessibilityRole="button" disabled={disabled || phase === 'busy'} onPress={press} style={[styles.button, phase === 'recording' && styles.recording, phase === 'busy' && { opacity: 0.6 }]}><Text style={styles.buttonText}>{phase === 'recording' ? '■ Parar e interpretar' : phase === 'busy' ? 'Interpretando…' : '● Registrar por voz'}</Text></Pressable>{message ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{message}</Text> : null}</View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#E2EFE7', borderRadius: 20, padding: 20, gap: 12 }, title: { color: '#17382F', fontSize: 20, fontWeight: '700' }, hint: { color: '#435F51', fontSize: 13, lineHeight: 20 }, button: { backgroundColor: '#19734F', padding: 17, borderRadius: 14, alignItems: 'center' }, recording: { backgroundColor: '#A33939' }, buttonText: { color: 'white', fontWeight: '700', fontSize: 16 } });
