import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEstudiosService } from '../src/api/estudios.service.js';
import { createHttpClient } from '../src/api/client.js';

test('clinical AI uses injected gateway and rotating host token; saves and lists the actual response', async t => {
  const calls = [], saved = [];
  let token = 'one';
  const analysis = { modeloNombre: 'YOLO11', version: '1', hallazgos: [], etiquetasNoSoportadas: ['reabsorcion_osea_periodontal'] };
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    let body;
    if (url.endsWith('/analizar-imagen')) body = analysis;
    else if (options.method === 'POST') { saved.push({ id: 'study-1', ...JSON.parse(options.body) }); body = saved[0]; }
    else body = saved;
    return new Response(JSON.stringify(body), { status: options.method === 'POST' && !url.endsWith('/analizar-imagen') ? 201 : 200 });
  };
  const service = createEstudiosService(createHttpClient({ apiBaseUrl: 'https://gateway.example/api/expediente', getAccessToken: () => token }));
  assert.deepEqual(await service.analizarImagen({ imagenBase64: 'aGVsbG8=', mimeType: 'image/png' }), analysis);
  token = 'two';
  const result = await service.guardarEstudio({ pacienteId: 'p/1', consultaId: 'c1', analisisIa: analysis });
  assert.equal(result.id, 'study-1'); assert.deepEqual(result.analisisIa, analysis);
  assert.deepEqual(await service.listarEstudiosPaciente('p/1'), [result]);
  assert.deepEqual(calls.map(c => c.url), ['https://gateway.example/api/expediente/estudios/analizar-imagen', 'https://gateway.example/api/expediente/estudios', 'https://gateway.example/api/expediente/estudios/paciente/p%2F1']);
  assert.deepEqual(calls.map(c => c.options.headers.Authorization), ['Bearer one', 'Bearer two', 'Bearer two']);
});

test('image analysis propagates public HTTP errors without saving a study', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ status: 415, detail: 'Unsupported image' }), { status: 415 }); };
  const service = createEstudiosService(createHttpClient({ apiBaseUrl: '/api/expediente', getAccessToken: () => 'host' }));
  await assert.rejects(service.analizarImagen({ imagenBase64: 'bad', mimeType: 'image/gif' }), e => e.status === 415);
  assert.equal(calls, 1);
});
