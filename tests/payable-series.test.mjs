import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPaymentEntries, installmentProgress, paymentGroupLabel, schedulePayable } from '../src/services/payables.ts';
import { buildReport } from '../src/services/reports.ts';

const bill = {
  id: 'carne', description: 'Parcela do carro', cents: 80000, category: 'Outros',
  scope: 'Familiar', status: 'scheduled', dueDate: '2027-01-31', createdAt: '2026-11-18T12:00:00Z',
};

test('repete no último dia de meses curtos e volta ao dia original, sem contagem para Pix', () => {
  const payments = schedulePayable(bill, { mode: 'monthly', additionalMonths: 2 });
  assert.deepEqual(payments.map(item => item.dueDate), ['2027-01-31', '2027-02-28', '2027-03-31']);
  assert.equal(payments[0].id, bill.id);
  assert.equal(new Set(payments.map(item => item.id)).size, 3);
  assert.equal(paymentGroupLabel(payments[0], installmentProgress(payments), payments), '0 pagos · 3 em aberto');
  assert.equal(bill.paymentSeries, undefined);
});

test('usa o histórico informado sem criar despesas retroativas e atualiza as parcelas em aberto', () => {
  const payments = schedulePayable(bill, { mode: 'installments', total: 12, alreadyPaid: 6 });
  assert.equal(payments.length, 6);
  assert.equal(payments[0].paymentSeries.number, 7);
  assert.equal(paymentGroupLabel(payments[0], installmentProgress(payments), payments), '6 de 12 parcelas pagas · 6 em aberto');
  assert.equal(buildReport(payments, 2027, 0, 'Todos').total, 0);
  assert.equal(buildReport(payments, 2027, 0, 'Todos').pendingTotal, 80000);
  payments[0].status = 'paid';
  payments[0].paidAt = '2027-01-31T12:00:00Z';
  assert.equal(payments[1].paymentSeries.number, 8);
  assert.equal(paymentGroupLabel(payments[1], installmentProgress(payments), payments), '7 de 12 parcelas pagas · 5 em aberto');
  assert.equal(buildReport(payments, 2027, 0, 'Todos').total, 80000);
  assert.equal(buildReport(payments, 2027, 0, 'Todos').pendingTotal, 0);
});

test('recusa gerar uma segunda série e rejeita totais inválidos', () => {
  assert.throws(() => schedulePayable(bill, { mode: 'installments', total: 12, alreadyPaid: 12 }));
  assert.throws(() => schedulePayable(bill, { mode: 'monthly', additionalMonths: 0 }));
  assert.throws(() => schedulePayable({ ...bill, dueDate: '2027-02-31' }, { mode: 'monthly', additionalMonths: 2 }));
  const [initial] = schedulePayable(bill, { mode: 'monthly', additionalMonths: 1 });
  assert.throws(() => schedulePayable(initial, { mode: 'monthly', additionalMonths: 1 }));
});


test('agrupa a série com lançamentos pagos e pendentes na ordem dos vencimentos', () => {
  const [first, second] = schedulePayable(bill, { mode: 'monthly', additionalMonths: 1 });
  first.status = 'paid';
  const unrelated = { ...bill, id: 'conta-avulsa' };
  const groups = groupPaymentEntries([second, unrelated, first]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].entries.map(item => [item.id, item.status]), [[first.id, 'paid'], [second.id, 'scheduled']]);
  assert.deepEqual(groups[1].entries, [unrelated]);
  assert.equal(paymentGroupLabel(first, installmentProgress(groups[0].entries), groups[0].entries), '1 pago · 1 em aberto');
});
