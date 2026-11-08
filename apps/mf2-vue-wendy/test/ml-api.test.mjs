import test from 'node:test';
import assert from 'node:assert/strict';
import { createMs3Service } from '../src/api/ms3Api.js';
test('ML endpoints use exact gateway paths and current host Bearer without touching mutation intents', async t => {
  let token = 'one'; const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({url, ...options}); return new Response(JSON.stringify({ success: true, data: { probabilidadNoShow: 0.65, nivelRiesgo: 'MEDIO', featuresImputadas: [] } }), {status: 200}); });
  const s = createMs3Service({apiBaseUrl: 'https://gateway.example/api/agendamiento', getAccessToken: () => token});
  await s.getClusters(); token = 'two'; const result = await s.predictNoShow({ cita_id: 'c1' });
  assert.equal(result.data.nivelRiesgo, 'MEDIO');
  assert.deepEqual(calls.map(c => [c.url, c.method, c.headers.Authorization]), [
    ['https://gateway.example/api/agendamiento/ml/clusters', 'GET', 'Bearer one'],
    ['https://gateway.example/api/agendamiento/ml/predict-noshow', 'POST', 'Bearer two']]);
  assert.deepEqual(JSON.parse(calls[1].body), {cita_id: 'c1'});
  assert.equal(calls[1].headers['Idempotency-Key'], undefined);
});
