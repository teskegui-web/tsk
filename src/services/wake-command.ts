export function extractWakeCommand(transcript: string, armedUntil: number, now: number) {
  const match = transcript.trim().match(/^agente[\s,.:!—-]*(.*)$/i);
  if (match && !match[1].trim()) return { text: '', armedUntil: now + 8000 };
  const text = match ? match[1].trim() : now < armedUntil ? transcript.trim() : '';
  return { text, armedUntil: text ? 0 : armedUntil };
}
