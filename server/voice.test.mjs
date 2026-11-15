import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { makeServer, validateDraft } from './voice.mjs';

const draft = { transcript: 'Gastei vinte reais em gasolina', description: 'Gasolina', cents: 2000, category: 'Combustível', scope: null };
test('rejeita valor ausente, fracionado e categoria desconhecida', () => {
  assert.deepEqual(validateDraft(draft), draft);
  for (const cents of [0, -1, 20.5, null, 100000001]) assert.throws(() => validateDraft({ ...draft, cents }));
  assert.throws(() => validateDraft({ ...draft, category: 'inventada' }));
});
test('protege endpoint, interpreta áudio e trata cota sem expor chave', async () => {
  let mode = 'success'; let calls = 0;
  const server = makeServer({ key: 'private-test-key', token: 'test-token', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers['x-goog-api-key'], 'private-test-key');
    const request = JSON.parse(options.body);
    const part = request.contents[0].parts[0];
    if (part.inlineData) assert.equal(part.inlineData.mimeType, 'audio/mp4');
    else assert.equal(part.text, 'gastei vinte reais em gasolina');
    if (mode === 'quota') return new Response('{}', { status: 429 });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(mode === 'missing' ? { ...draft, cents: 0 } : draft) }] } }] });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/voice`;
  const send = (body, auth = true) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test-token' } : {}) }, body: JSON.stringify(body) });
  const input = { mimeType: 'audio/mp4', audio: Buffer.alloc(120).toString('base64') };
  try {
    assert.equal((await send(input, false)).status, 401);
    assert.equal((await send({ ...input, mimeType: 'text/plain' })).status, 400);
    assert.equal(calls, 0);
    assert.deepEqual(await (await send(input)).json(), draft);
    assert.deepEqual(await (await send({ text: 'gastei vinte reais em gasolina' })).json(), draft);
    assert.equal((await send({ text: 'x'.repeat(2001) })).status, 400);
    mode = 'missing'; assert.equal((await send(input)).status, 422);
    mode = 'quota'; const response = await send(input); assert.equal(response.status, 429);
    assert.ok(!(await response.text()).includes('private-test-key'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
