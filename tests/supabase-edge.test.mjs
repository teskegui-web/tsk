import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../supabase/functions/financial-ai/index.js';
const settings = { APP_ORIGIN: 'https://finance.example', SUPABASE_URL: 'https://db.example', SUPABASE_ANON_KEY: 'public-test-key', GEMINI_API_KEY: 'server-test-key' };
const request = (body, authorization = 'Bearer test-session') => new Request('https://edge.example/financial-ai/voice', { method: 'POST', headers: { Origin: settings.APP_ORIGIN, ...(authorization && { Authorization: authorization }) }, body: JSON.stringify(body) });
test('Edge rejects unauthenticated and foreign-origin requests before AI', async () => {
  const handler = makeHandler(name => settings[name], async () => { throw Error('Unexpected upstream request'); });
  assert.equal((await handler(request({ text: 'gastei dez' }, ''))).status, 401);
  const foreign = new Request('https://edge.example/financial-ai/voice', { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' });
  assert.equal((await handler(foreign)).status, 403);
});
test('Edge verifies session and quota, validates draft, and keeps Gemini key server-side', async () => {
  const calls = [];
  const handler = makeHandler(name => settings[name], async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-a' });
    if (url.endsWith('/rpc/consume_finance_ai')) return Response.json(true);
    assert.equal(options.headers['x-goog-api-key'], settings.GEMINI_API_KEY);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ transcript: 'gastei dez em gasolina', description: 'Gasolina', cents: 1000, kind: 'expense', category: 'Combustível', scope: null }) }] } }] });
  });
  const response = await handler(request({ text: 'gastei dez em gasolina' }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).cents, 1000);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer test-session');
  assert.equal(calls[0].options.headers.apikey, 'public-test-key');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), settings.APP_ORIGIN);
});
test('Edge denies invalid session and exhausted quota without calling Gemini', async () => {
  let requests = 0;
  const handler = makeHandler(name => settings[name], async url => {
    requests++;
    return url.endsWith('/auth/v1/user') ? Response.json({ id: 'user-a' }) : Response.json(false);
  });
  assert.equal((await handler(request({ text: 'gastei dez' }))).status, 429);
  assert.equal(requests, 2);
  const denied = makeHandler(name => settings[name], async () => new Response(null, { status: 401 }));
  assert.equal((await denied(request({ text: 'gastei dez' }))).status, 401);
});
