import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category, FamilyMember } from '@/services/expense-store';
import type { Draft } from '@/services/text-expense';
import { localDateKey } from '@/services/payables';
import { apiEndpoint, apiHeaders } from '@/services/web-api';

export function VoiceExpense({ onDraft, disabled = false, categories = [], members = [] }: { onDraft: (draft: Draft) => Promise<void>; disabled?: boolean; categories?: Category[]; members?: FamilyMember[] }) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'busy'>('idle');
  const [message, setMessage] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); } stream.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  async function start() {
    if (lock.current) return;
    lock.current = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Seu navegador não oferece gravação. Use Safari ou Chrome atualizado em uma conexão HTTPS.');
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { input.getTracks().forEach(track => track.stop()); return; }
      stream.current = input;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error('Formato de áudio não suportado por este navegador.');
      const current = new MediaRecorder(input, { mimeType: mime });
      recorder.current = current;
      const parts: BlobPart[] = [];
      current.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
      current.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        input.getTracks().forEach(track => track.stop());
        if (!mounted.current) return;
        setPhase('busy'); setMessage('Interpretando sua fala…');
        void (async () => {
          const blob = new Blob(parts, { type: mime });
          if (blob.size < 100 || blob.size > 2000000) throw new Error('Grave uma frase curta, de até vinte segundos.');
          const audio = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Falha ao ler gravação.')); reader.readAsDataURL(blob); });
          const response = await fetch(apiEndpoint('/voice'), { method: 'POST', headers: await apiHeaders(), body: JSON.stringify({ audio, mimeType: mime.split(';')[0], referenceDate: localDateKey(new Date()), categories: categories.map(item => ({ name: item.name, kind: item.kind })), members: members.map(item => ({ id: item.id, name: item.name, role: item.role })) }), signal: AbortSignal.timeout(55000) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Não foi possível interpretar a fala.');
          if (mounted.current) { await onDraft(data); setMessage(`Ouvi: “${data.transcript}”`); }
        })().catch(error => { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }).finally(() => { lock.current = false; if (mounted.current) setPhase('idle'); });
      };
      current.onerror = () => { input.getTracks().forEach(track => track.stop()); lock.current = false; setPhase('idle'); setMessage('A gravação foi interrompida. Tente novamente.'); };
      current.start(); setPhase('recording'); setMessage('Ouvindo… toque para parar.');
      timer.current = setTimeout(() => { if (current.state === 'recording') current.stop(); }, 20000);
    } catch (error) { stream.current?.getTracks().forEach(track => track.stop()); lock.current = false; setMessage(error instanceof Error ? error.message : 'Permita o microfone no navegador.'); }
  }
  return <View style={styles.card}><Text style={styles.title}>Fale seu lançamento</Text><Text style={styles.hint}>“Recebi três mil de salário” ou “conta de energia de cem reais, vencimento dia doze de dezembro”.</Text><Text style={styles.hint}>Ao gravar, áudio, categorias e nomes dos membros são enviados ao Gemini para registrar automaticamente. Você pode desfazer. Na faixa gratuita, o Google pode usar o conteúdo para melhorar produtos.</Text><Pressable accessibilityRole="button" disabled={disabled || phase === 'busy'} style={[styles.button, phase === 'recording' && { backgroundColor: '#A33939' }]} onPress={() => { if (phase === 'recording') recorder.current?.stop(); else void start(); }}><Text style={styles.buttonText}>{phase === 'recording' ? '■ Parar e interpretar' : phase === 'busy' ? 'Interpretando…' : '● Registrar por voz'}</Text></Pressable>{message ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{message}</Text> : null}</View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#E2EFE7', padding: 20, borderRadius: 20, gap: 12 }, title: { color: '#17382F', fontSize: 20, fontWeight: '700' }, hint: { color: '#435F51', fontSize: 13, lineHeight: 20 }, button: { backgroundColor: '#19734F', padding: 17, borderRadius: 14 }, buttonText: { color: '#FFF', textAlign: 'center', fontWeight: '700' } });
