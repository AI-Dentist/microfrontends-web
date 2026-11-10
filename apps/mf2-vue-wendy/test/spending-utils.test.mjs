import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePatientSpending } from '../src/utils/spending.js';

test('resolvePatientSpending handles null, undefined, and non-object assignments safely', () => {
  for (const input of [null, undefined, 'string', 123, true, []]) {
    const result = resolvePatientSpending(input);
    assert.deepEqual(result, {
      hasReal: false,
      realAmount: null,
      hasEstimated: false,
      estimatedAmount: null,
      isUnavailable: true,
    });
  }
});

test('resolvePatientSpending accepts valid observed positive real spending and estimated alongside real', () => {
  const result = resolvePatientSpending({
    gasto_total_real: 240.5,
    gasto_total_estimado: 180,
    gasto_moneda: 'BOB',
    gasto_origen: 'real_ms1_pagado',
    gasto_real_observado: true,
  });
  assert.equal(result.hasReal, true);
  assert.equal(result.realAmount, 240.5);
  assert.equal(result.hasEstimated, true);
  assert.equal(result.estimatedAmount, 180);
  assert.equal(result.isUnavailable, false);
});

test('resolvePatientSpending accepts observed zero real spending', () => {
  const result = resolvePatientSpending({
    gasto_total_real: 0,
    gasto_total_estimado: 60,
    gasto_moneda: 'BOB',
    gasto_origen: 'real_ms1_pagado',
    gasto_real_observado: true,
  });
  assert.equal(result.hasReal, true);
  assert.equal(result.realAmount, 0);
  assert.equal(result.hasEstimated, true);
  assert.equal(result.estimatedAmount, 60);
  assert.equal(result.isUnavailable, false);
});

test('resolvePatientSpending falls back to estimated when observed is false', () => {
  const result = resolvePatientSpending({
    gasto_total_real: null,
    gasto_total_estimado: 180,
    gasto_moneda: 'BOB',
    gasto_origen: 'estimado_fallback',
    gasto_real_observado: false,
  });
  assert.equal(result.hasReal, false);
  assert.equal(result.realAmount, null);
  assert.equal(result.hasEstimated, true);
  assert.equal(result.estimatedAmount, 180);
  assert.equal(result.isUnavailable, false);
});

test('resolvePatientSpending rejects string coercion for amounts and flags', () => {
  // String amount
  const strAmount = resolvePatientSpending({
    gasto_total_real: '240',
    gasto_total_estimado: 180,
    gasto_moneda: 'BOB',
    gasto_origen: 'real_ms1_pagado',
    gasto_real_observado: true,
  });
  assert.equal(strAmount.hasReal, false);
  assert.equal(strAmount.hasEstimated, true);

  // String boolean flag
  const strFlag = resolvePatientSpending({
    gasto_total_real: 240,
    gasto_total_estimado: 180,
    gasto_moneda: 'BOB',
    gasto_origen: 'real_ms1_pagado',
    gasto_real_observado: 'true',
  });
  assert.equal(strFlag.hasReal, false);
  assert.equal(strFlag.hasEstimated, true);

  // String estimated
  const strEst = resolvePatientSpending({
    gasto_total_real: null,
    gasto_total_estimado: '180',
    gasto_moneda: 'BOB',
    gasto_origen: 'estimado_fallback',
    gasto_real_observado: false,
  });
  assert.equal(strEst.hasReal, false);
  assert.equal(strEst.hasEstimated, false);
  assert.equal(strEst.isUnavailable, true);
});

test('resolvePatientSpending rejects negative and non-finite amounts', () => {
  for (const invalid of [-1, -0.01, NaN, Infinity, -Infinity]) {
    const res = resolvePatientSpending({
      gasto_total_real: invalid,
      gasto_total_estimado: 180,
      gasto_moneda: 'BOB',
      gasto_origen: 'real_ms1_pagado',
      gasto_real_observado: true,
    });
    assert.equal(res.hasReal, false);
    assert.equal(res.hasEstimated, true);
  }

  for (const invalid of [-1, NaN, Infinity]) {
    const res = resolvePatientSpending({
      gasto_total_real: null,
      gasto_total_estimado: invalid,
      gasto_moneda: 'BOB',
      gasto_origen: 'estimado_fallback',
      gasto_real_observado: false,
    });
    assert.equal(res.hasReal, false);
    assert.equal(res.hasEstimated, false);
    assert.equal(res.isUnavailable, true);
  }
});

test('resolvePatientSpending prevents currency forgery when currency is not BOB', () => {
  const result = resolvePatientSpending({
    gasto_total_real: 240,
    gasto_total_estimado: 180,
    gasto_moneda: 'USD',
    gasto_origen: 'real_ms1_pagado',
    gasto_real_observado: true,
  });
  assert.equal(result.hasReal, false);
  assert.equal(result.hasEstimated, false);
  assert.equal(result.isUnavailable, true);
});

test('resolvePatientSpending rejects mismatched origin for real spending', () => {
  const result = resolvePatientSpending({
    gasto_total_real: 240,
    gasto_total_estimado: 180,
    gasto_moneda: 'BOB',
    gasto_origen: 'estimado_fallback',
    gasto_real_observado: true,
  });
  assert.equal(result.hasReal, false);
  assert.equal(result.hasEstimated, true);
  assert.equal(result.estimatedAmount, 180);
});

test('resolvePatientSpending handles legacy payload with missing fields as unavailable', () => {
  const result = resolvePatientSpending({
    paciente_id: 'pa-uuid',
    cluster: 'Frecuente y Puntual',
  });
  assert.equal(result.hasReal, false);
  assert.equal(result.realAmount, null);
  assert.equal(result.hasEstimated, false);
  assert.equal(result.estimatedAmount, null);
  assert.equal(result.isUnavailable, true);
});
