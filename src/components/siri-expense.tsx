import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, Text, View } from 'react-native';
import { Draft, interpretText } from '@/services/text-expense';

type Command = { id: string; text: string };
const siri = Platform.OS === 'ios' ? requireOptionalNativeModule<{ pendingCommands(): Promise<Command[]>; acknowledge(id: string): Promise<void> }>('TskSiri') : null;
export function SiriExpense({ onDraft, ready }: { onDraft: (draft: Draft, commandId?: string) => Promise<void>; ready: boolean }) {
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const callback = useRef(onDraft);
  const inFlight = useRef(false);
  useEffect(() => { callback.current = onDraft; }, [onDraft]);
  useEffect(() => {
    if (!siri || !ready) return;
    const native = siri;
    let disposed = false;
    let failed = false;
    async function check() {
      if (disposed || failed || inFlight.current || AppState.currentState !== 'active') return;
      inFlight.current = true;
      try {
        const commands = await native.pendingCommands();
        for (const command of commands) {
          if (disposed) break;
          setMessage('Recebi o comando da Siri. Interpretando…');
          const draft = await interpretText(command.text);
          if (disposed) break;
          await callback.current(draft, `siri-${command.id}`);
          await native.acknowledge(command.id);
          setMessage('Gasto recebido da Siri e salvo no aparelho.');
        }
      } catch (error) { if (!disposed) { failed = true; setMessage(error instanceof Error ? error.message : 'Falha ao receber comando da Siri.'); } }
      finally { inFlight.current = false; }
    }
    void check();
    const interval = setInterval(() => { void check(); }, 1500);
    return () => { disposed = true; clearInterval(interval); };
  }, [ready, retry]);
  return <View style={{ padding: 18, gap: 10 }}><Text style={{ color: '#17382F', fontWeight: '700' }}>Lançar pela Siri</Text><Text style={{ color: '#586B64', lineHeight: 20 }}>{siri ? 'Diga “E aí, Siri, lance no Agente Financeiro”. Se ela perguntar o gasto, diga “dez reais em gasolina”. O app abrirá para concluir.' : 'A integração com Siri estará disponível na build própria do Agente Financeiro.'}</Text>{message ? <><Text accessibilityLiveRegion="polite" style={{ color: '#435F51' }}>{message}</Text><Pressable accessibilityRole="button" style={{ paddingVertical: 14 }} onPress={() => setRetry(value => value + 1)}><Text style={{ color: '#19734F' }}>Tentar receber pendentes novamente</Text></Pressable><Pressable accessibilityRole="button" style={{ paddingVertical: 14 }} onPress={() => {
    void (async () => {
      if (!siri || inFlight.current) return;
      const pending = await siri.pendingCommands();
      if (pending[0]) await siri.acknowledge(pending[0].id);
      setMessage('Primeiro comando pendente descartado.'); setRetry(value => value + 1);
    })().catch(() => setMessage('Não foi possível descartar o comando.'));
  }}><Text style={{ color: '#A33939' }}>Descartar primeiro comando pendente</Text></Pressable></> : null}</View>;
}
