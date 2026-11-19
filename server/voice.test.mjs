import { test } from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { makeServer, validateDraft, validCalendarDate } from './voice.mjs';

const draft = { transcript: 'Gastei vinte reais em gasolina', description: 'Gasolina', cents: 2000, category: 'Combustível', scope: null, kind: 'expense', memberId: null };
test('rejeita valor ausente, fracionado e categoria desconhecida', () => {
  assert.deepEqual(validateDraft(draft), draft);
  for (const cents of [0, -1, 20.5, null, 100000001]) assert.throws(() => validateDraft({ ...draft, cents }));
  assert.throws(() => validateDraft({ ...draft, category: 'inventada' }));
});
test('aceita receitas nas categorias corretas e mantém despesas antigas', () => {
  for (const category of ['Salário', 'Vale-alimentação', 'Freelance', 'Renda extra', 'Outras receitas']) {
    assert.equal(validateDraft({ ...draft, kind: 'income', category }).kind, 'income');
  }
  assert.throws(() => validateDraft({ ...draft, kind: 'income' }));
  assert.throws(() => validateDraft({ ...draft, category: 'Salário' }));
  assert.throws(() => validateDraft({ ...draft, kind: 'transfer' }));
  const { kind: _kind, ...legacy } = draft;
  assert.equal(validateDraft(legacy).kind, 'expense');
});
test('protege endpoint, interpreta áudio e trata cota sem expor chave', async () => {
  let mode = 'success'; let calls = 0;
  const server = makeServer({ key: 'private-test-key', token: 'test-token', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers['x-goog-api-key'], 'private-test-key');
    const request = JSON.parse(options.body);
    const part = request.contents[0].parts.at(-1);
    if (part.inlineData) assert.equal(part.inlineData.mimeType, 'audio/mp4');
    else assert.equal(part.text, 'gastei vinte reais em gasolina');
    if (mode === 'quota') return new Response('{}', { status: 429 });
    if (mode === 'scheduled') {
      assert.ok(request.contents[0].parts[0].text.includes('2026-11-15'));
      assert.ok(request.systemInstruction.parts[0].text.includes('próxima ocorrência'));
    }
    const output = mode === 'missing' ? { ...draft, cents: 0 } : mode === 'scheduled' ? { ...draft, status: 'scheduled', dueDate: '2026-12-12' } : draft;
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] });
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
    mode = 'scheduled';
    assert.deepEqual(await (await send({ ...input, referenceDate: '2026-11-15' })).json(), { ...draft, status: 'scheduled', dueDate: '2026-12-12' });
    const beforeInvalidDate = calls;
    assert.equal((await send({ ...input, referenceDate: '2026-02-31' })).status, 400);
    assert.equal(calls, beforeInvalidDate);
    mode = 'success';
    assert.deepEqual(await (await send({ text: 'gastei vinte reais em gasolina' })).json(), draft);
    assert.equal((await send({ text: 'x'.repeat(2001) })).status, 400);
    mode = 'missing'; assert.equal((await send(input)).status, 422);
    mode = 'quota'; const response = await send(input); assert.equal(response.status, 429);
    assert.ok(!(await response.text()).includes('private-test-key'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('contas por voz exigem vencimento válido e não podem virar despesa paga silenciosamente', () => {
  const scheduled = { ...draft, status: 'scheduled', dueDate: '2026-12-12' };
  assert.equal(validateDraft(scheduled).status, 'scheduled');
  assert.equal(validateDraft(scheduled).dueDate, '2026-12-12');
  for (const dueDate of [undefined, null, '2026-02-31', '12/12/2026', '2026-13-12']) assert.throws(() => validateDraft({ ...scheduled, dueDate }));
  assert.throws(() => validateDraft({ ...scheduled, kind: 'income', category: 'Salário' }));
  assert.throws(() => validateDraft({ ...scheduled, status: 'paid' }));
  assert.throws(() => validateDraft({ ...draft, status: 'unknown' }));
  assert.deepEqual(validateDraft({ ...draft, status: 'paid', dueDate: null }), draft);
  assert.equal(validCalendarDate('2028-02-29'), true);
  assert.equal(validCalendarDate('2026-02-29'), false);
});
test('valida categorias personalizadas e vínculo com membro sem aceitar IDs inventados', () => {
  const context = { categories: [{ name: 'Escola', kind: 'expense' }], members: [{ id: 'gabriel', name: 'Gabriel', role: 'Filho' }] };
  const value = { ...draft, category: 'Escola', memberId: 'gabriel' };
  assert.equal(validateDraft(value, context).memberId, 'gabriel');
  assert.throws(() => validateDraft({ ...value, memberId: 'inventado' }, context));
  assert.throws(() => validateDraft(value));
  assert.throws(() => validateDraft({ ...value, category: 'Combustível' }, context));
  assert.equal(validateDraft({ ...value, memberId: null }, context).memberId, null);
});
