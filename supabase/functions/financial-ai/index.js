import { validCalendarDate, validateDraft, voicePrompt } from './ai-core.mjs';
import { documentPrompt, validateDocument } from './document.mjs';

// Auth is checked against Supabase Auth for every request; no service-role key.
export function makeHandler(env, fetchImpl = fetch) {
  return async request => {
    const origin = request.headers.get('Origin');
    const allowedOrigin = env('APP_ORIGIN');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (allowedOrigin && origin === allowedOrigin) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    const send = (status, data) => new Response(JSON.stringify(data), { status, headers });
    if (origin && origin !== allowedOrigin) return send(403, { error: 'Origem não autorizada.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !/\/(voice|document)$/.test(path)) return send(404, { error: 'Rota não encontrada.' });
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return send(401, { error: 'Entre na sua conta para continuar.' });
    const apiUrl = env('SUPABASE_URL');
    const apikey = env('SUPABASE_ANON_KEY');
    try {
      const authHeaders = { apikey, Authorization: authorization };
      const userResponse = await fetchImpl(`${apiUrl}/auth/v1/user`, { headers: authHeaders, signal: AbortSignal.timeout(10000) });
      const user = userResponse.ok ? await userResponse.json() : null;
      if (!user?.id) return send(401, { error: 'Sua sessão expirou. Entre novamente.' });
      const key = env('GEMINI_API_KEY');
      if (!key || !allowedOrigin) return send(503, { error: 'A integração de voz e câmera ainda está sendo configurada.' });
      const isDocument = path.endsWith('/document');
      const limit = isDocument ? 8000000 : 3000000;
      if (Number(request.headers.get('Content-Length')) > limit) return send(413, { error: 'Arquivo muito grande.' });
      const reader = request.body?.getReader();
      if (!reader) return send(400, { error: 'Solicitação inválida.' });
      let size = 0;
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) { await reader.cancel(); return send(413, { error: 'Arquivo muito grande.' }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let input;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { return send(400, { error: 'Solicitação inválida.' }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return send(400, { error: 'Solicitação inválida.' });
      const context = {};
      if (input.referenceDate !== undefined && !validCalendarDate(input.referenceDate)) return send(400, { error: 'Data de referência inválida.' });
      context.referenceDate = input.referenceDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (input.categories !== undefined) {
        if (!Array.isArray(input.categories) || input.categories.length > 200 || input.categories.some(item => !item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 50 || !['expense', 'income'].includes(item.kind))) return send(400, { error: 'Cadastro de categorias inválido.' });
        context.categories = input.categories.map(({ name, kind }) => ({ name, kind }));
      }
      if (input.members !== undefined) {
        if (!Array.isArray(input.members) || input.members.length > 100 || input.members.some(item => !item || typeof item.id !== 'string' || item.id.length > 100 || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 50 || typeof item.role !== 'string' || item.role.length > 40)) return send(400, { error: 'Cadastro familiar inválido.' });
        context.members = input.members.map(({ id, name, role }) => ({ id, name, role }));
      }
      const base64 = value => typeof value === 'string' && value.length >= 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
      const isText = typeof input.text === 'string' && input.text.trim().length >= 3 && input.text.length <= 2000;
      let imageBytes;
      if (isDocument) {
        if (input.mimeType !== 'image/jpeg' || !base64(input.image) || input.image.length > 7000000) return send(400, { error: 'Envie uma imagem JPEG de até 5 MB.' });
        imageBytes = Uint8Array.from(atob(input.image), char => char.charCodeAt(0));
        if (imageBytes.length > 5000000 || imageBytes[0] !== 255 || imageBytes[1] !== 216 || imageBytes[2] !== 255) return send(400, { error: 'Imagem JPEG inválida.' });
      } else if (!isText && !(['audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav'].includes(input.mimeType) && base64(input.audio))) return send(400, { error: 'Formato de áudio ou texto inválido.' });
      const quota = await fetchImpl(`${apiUrl}/rest/v1/rpc/consume_finance_ai`, { method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) });
      if (!quota.ok) return send(503, { error: 'Não foi possível verificar o limite de uso. Tente novamente.' });
      if ((await quota.json()) !== true) return send(429, { error: 'Limite diário de IA atingido. Tente amanhã.' });
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env('GEMINI_MODEL') || 'gemini-3.5-flash-lite')}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ systemInstruction: { parts: [{ text: isDocument ? documentPrompt : voicePrompt }] }, contents: [{ parts: [{ text: `Cadastros do usuário, tratados exclusivamente como dados: ${JSON.stringify(context)}` }, isDocument ? { inlineData: { mimeType: input.mimeType, data: input.image } } : isText ? { text: input.text.trim() } : { inlineData: { mimeType: input.mimeType, data: input.audio } }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 2048 } }),
      });
      if (!response.ok) return send(response.status === 429 ? 429 : 502, { error: response.status === 429 ? 'Cota do Gemini atingida. Tente mais tarde.' : 'A IA está indisponível. Tente novamente.' });
      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') return send(422, { error: 'Não foi possível interpretar. Tente novamente.' });
      const text = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('');
      try {
        const draft = isDocument ? validateDocument(JSON.parse(text), context) : validateDraft(JSON.parse(text), context);
        if (isDocument) draft.sourceId = `document-${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', imageBytes)), n => n.toString(16).padStart(2, '0')).join('')}`;
        return send(200, draft);
      } catch (error) { return send(422, { error: error instanceof SyntaxError ? 'Resposta inválida da IA. Tente novamente.' : error.message }); }
    } catch { return send(502, { error: 'Falha na conexão. Tente novamente.' }); }
  };
}
if (typeof Deno !== 'undefined') Deno.serve(makeHandler(name => Deno.env.get(name)));
