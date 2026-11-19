import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { validateDocument } from './document.mjs';
import { makeServer } from './voice.mjs';

const context = { categories: [{ name: 'Moradia', kind: 'expense' }] };
const boleto = { documentType: 'boleto', description: 'Energia', cents: 10000, category: 'Moradia', dueDate: '2026-12-12', transactionDate: null, warning: '' };
test('boletos preservam vencimento e campos ilegíveis ficam para revisão', () => {
  assert.deepEqual(validateDocument(boleto, context), boleto);
  const invalid = validateDocument({ ...boleto, cents: '100', dueDate: '2026-02-31', category: 'inventada', cpf: 'não deve retornar' }, context);
  assert.equal(invalid.cents, null); assert.equal(invalid.dueDate, null); assert.equal(invalid.category, null); assert.equal('cpf' in invalid, false);
  assert.throws(() => validateDocument({ documentType: 'unknown' }, context));
  const receipt = validateDocument({ ...boleto, documentType: 'receipt', transactionDate: '2026-11-14', dueDate: null }, context);
  assert.equal(receipt.transactionDate, '2026-11-14');
});
test('endpoint de documentos exige autenticação e JPEG, produz rascunho e ID estável sem salvar imagem', async () => {
  let calls = 0;
  const server = makeServer({ key: 'private', token: 'test', fetchImpl: async (_, options) => {
    calls++;
    const request = JSON.parse(options.body);
    assert.ok(request.systemInstruction.parts[0].text.includes('não é comprovante'));
    assert.equal(request.contents[0].parts.at(-1).inlineData.mimeType, 'image/jpeg');
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(boleto) }] } }] });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/document`;
  const request = (body, auth = true) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test' } : {}) }, body: JSON.stringify(body) });
  const bytes = Buffer.alloc(120); bytes[0] = 255; bytes[1] = 216; bytes[2] = 255;
  const input = { image: bytes.toString('base64'), mimeType: 'image/jpeg', ...context };
  try {
    assert.equal((await request(input, false)).status, 401);
    assert.equal((await request({ ...input, mimeType: 'text/plain' })).status, 400);
    assert.equal((await request({ ...input, image: Buffer.alloc(120).toString('base64') })).status, 400);
    assert.equal(calls, 0);
    const result = await (await request(input)).json();
    assert.equal(result.cents, 10000); assert.equal(result.dueDate, '2026-12-12');
    assert.match(result.sourceId, /^document-[a-f0-9]{64}$/);
    assert.equal((await (await request(input)).json()).sourceId, result.sourceId);
    assert.equal('image' in result, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
