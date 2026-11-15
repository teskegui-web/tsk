import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Draft, interpretText } from '@/services/text-expense';
import { extractWakeCommand } from '@/services/wake-command';

type SpeechModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
const speech = Platform.OS === 'ios' ? requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition') : null;
type Props = { onDraft: (draft: Draft, commandId?: string) => Promise<void>; ready: boolean; onListeningChange: (active: boolean) => void };
export function HandsFreeExpense({ onDraft, ready, onListeningChange }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const enabledRef = useRef(false);
  const busy = useRef(false);
  const callback = useRef(onDraft);
  const notify = useRef(onListeningChange);
  useEffect(() => { callback.current = onDraft; notify.current = onListeningChange; }, [onDraft, onListeningChange]);

  useEffect(() => {
    if (!speech) return;
    const native = speech;
    let restartTimer: ReturnType<typeof setTimeout> | undefined;
    let armedUntil = 0;
    let disposed = false;
    function begin() {
      if (disposed || !enabledRef.current || busy.current || AppState.currentState !== 'active') return;
      try { native.start({ lang: 'pt-BR', interimResults: false, continuous: false, requiresOnDeviceRecognition: true, contextualStrings: ['Agente', 'gasolina', 'combustível'] }); }
      catch { enabledRef.current = false; setEnabled(false); notify.current(false); setMessage('Não foi possível iniciar a escuta. Tente ativar novamente.'); }
    }
    function schedule() { clearTimeout(restartTimer); restartTimer = setTimeout(begin, 600); }
    const results = native.addListener('result', event => {
      if (!enabledRef.current || busy.current || !event.isFinal) return;
      const transcript = event.results[0]?.transcript?.trim() || '';
      const command = extractWakeCommand(transcript, armedUntil, Date.now());
      armedUntil = command.armedUntil;
      const text = command.text;
      if (!text && armedUntil > Date.now()) { setMessage('Pode falar o gasto.'); return; }
      if (!text) return;
      armedUntil = 0; busy.current = true;
      native.stop(); setMessage('Interpretando seu gasto…');
      const commandId = `handsfree-${Date.now()}-${Math.random()}`;
      void (async () => {
        try {
          const draft = await interpretText(text);
          if (!disposed) { await callback.current(draft, commandId); setMessage(`Adicionado: ${draft.description}. Diga “Agente” para o próximo gasto.`); }
        } catch (error) { if (!disposed) setMessage(error instanceof Error ? error.message : 'Não foi possível registrar o gasto.'); }
        finally { busy.current = false; schedule(); }
      })();
    });
    const end = native.addListener('end', schedule);
    const errors = native.addListener('error', event => {
      if (!enabledRef.current || event.error === 'aborted') return;
      if (event.error === 'no-speech') { schedule(); return; }
      enabledRef.current = false; setEnabled(false); notify.current(false);
      setMessage('Escuta interrompida. Confira as permissões e o reconhecimento local em português no iPhone.');
    });
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') { enabledRef.current = false; setEnabled(false); notify.current(false); native.abort(); }
    });
    if (enabled) begin();
    return () => { disposed = true; clearTimeout(restartTimer); results.remove(); end.remove(); errors.remove(); appState.remove(); native.abort(); };
  }, [enabled]);

  async function toggle() {
    if (enabledRef.current) { enabledRef.current = false; setEnabled(false); onListeningChange(false); speech?.abort(); return; }
    if (!speech || !ready) return;
    try {
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Permita microfone e reconhecimento de fala nos Ajustes.');
      const locales = await speech.getSupportedLocales({});
      if (!speech.supportsOnDeviceRecognition() || !locales.installedLocales.some(locale => /^pt[-_]BR$/i.test(locale))) throw new Error('O reconhecimento local em português brasileiro não está instalado neste iPhone. O botão de gravação continua disponível.');
      enabledRef.current = true; setEnabled(true); onListeningChange(true); setMessage('Ouvindo no aparelho. Diga “Agente, gastei dez reais em gasolina”.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível ativar a escuta.'); }
  }

  return <View style={styles.card}><Text style={styles.title}>Modo “Agente”</Text><Text style={styles.hint}>{speech ? 'Com o app aberto, ative a escuta e fale sem tocar no microfone. Só a frase após “Agente” é enviada à IA. A escuta para ao sair do app.' : 'Disponível na build própria para iPhone. No Expo Go, use o botão de gravação abaixo.'}</Text>{speech ? <Pressable accessibilityRole="button" disabled={!ready} onPress={() => { void toggle(); }} style={styles.button}><Text style={styles.buttonText}>{enabled ? 'Desativar escuta' : 'Ativar escuta por “Agente”'}</Text></Pressable> : null}{message ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{message}</Text> : null}</View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#E2EFE7', padding: 20, borderRadius: 20, gap: 12 }, title: { color: '#17382F', fontSize: 20, fontWeight: '700' }, hint: { color: '#435F51', fontSize: 13, lineHeight: 20 }, button: { backgroundColor: '#19734F', padding: 16, borderRadius: 14 }, buttonText: { color: 'white', textAlign: 'center', fontWeight: '700' } });
