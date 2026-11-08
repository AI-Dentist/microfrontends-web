import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { JSDOM } from '../../mf-erp/node_modules/jsdom/lib/api.js';
import React, { act } from 'react';
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://fixture.invalid' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.FileReader = dom.window.FileReader; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
register('./helpers/jsx-loader.mjs', import.meta.url);
const { DevAuthContext } = await import('../src/context/dev-auth-context-def.js');
const { ClinicalServicesContext } = await import('../src/context/ClinicalServices.jsx');
const { RadiographAnalysis } = await import('../src/components/estudios/RadiographAnalysis.jsx');
const analysis = { modeloNombre: 'YOLO11', version: '1', confianzaGlobal: 0.9, severidadMaxima: 'ALTA', aviso: 'Apoyo, no diagnóstico.', etiquetasNoSoportadas: ['reabsorcion_osea_periodontal'], hallazgos: [{ etiqueta: 'caries_interproximal_o_oclusal', probabilidad: 0.9, severidad: 'ALTA', zonaSugerida: '36', boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, recomendacionClinica: 'Confirmar clínicamente' }] };
async function mount(t) {
  const calls = [], records = [];
  const services = { isActive: () => true, estudiosService: {
    analizarImagen: async payload => { calls.push(payload); return analysis; },
    guardarEstudio: async payload => { records.push({ id: 'saved', ...payload }); return records[0]; },
    listarEstudiosPaciente: async () => records,
  } };
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  await act(async () => root.render(React.createElement(DevAuthContext.Provider, { value: { token: 'test' } }, React.createElement(ClinicalServicesContext.Provider, { value: services }, React.createElement(RadiographAnalysis)))));
  t.after(async () => { await act(async () => root.unmount()); node.remove(); });
  return { node, calls, records };
}
async function input(node, selector, value) {
  await act(async () => { const el = node.querySelector(selector); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
for (const mime of ['image/jpeg', 'image/png', 'image/webp']) test(`uploads ${mime}, renders normalized overlay and confidence, then saves and lists assisted history`, async t => {
  const { node, calls, records } = await mount(t);
  await input(node, '[aria-label="Paciente ID"]', 'patient-1'); await input(node, '[aria-label="Consulta ID"]', 'visit-1');
  const file = new window.File(['pixels'], 'radiograph', { type: mime });
  await act(async () => { const el = node.querySelector('input[type=file]'); Object.defineProperty(el, 'files', { value: [file], configurable: true }); el.dispatchEvent(new window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 30)); });
  assert.ok(node.querySelector('img[alt="Radiografía seleccionada"]'));
  await act(async () => node.querySelector('[data-action=analyze]').click());
  assert.equal(calls[0].mimeType, mime); assert.ok(calls[0].imagenBase64);
  assert.equal(node.querySelector('[data-detection]').style.left, '10%');
  assert.equal(node.querySelector('[data-detection]').style.height, '40%');
  assert.equal(node.querySelector('progress').value, 0.9);
  for (const value of ['90', 'ALTA', '36', 'Confirmar clínicamente', 'reabsorcion_osea_periodontal', 'Apoyo, no diagnóstico.']) assert.ok(node.textContent.includes(value), value);
  await act(async () => node.querySelector('[data-action=save]').click());
  assert.equal(records.length, 1); assert.equal(records[0].pacienteId, 'patient-1'); assert.equal(records[0].consultaId, 'visit-1');
  assert.deepEqual(records[0].analisisIa.hallazgos, analysis.hallazgos);
  assert.ok(node.querySelector('[data-history]').textContent.includes('YOLO11'));
});
test('rejects unsupported files before inference and leaves no preview or stored diagnosis', async t => {
  const { node, calls, records } = await mount(t);
  await act(async () => { const el = node.querySelector('input[type=file]'); Object.defineProperty(el, 'files', { value: [new window.File(['x'], 'x.gif', { type: 'image/gif' })] }); el.dispatchEvent(new window.Event('change', { bubbles: true })); });
  assert.match(node.querySelector('[role=alert]').textContent, /JPEG.*PNG.*WebP/);
  assert.equal(node.querySelector('img'), null); assert.equal(calls.length, 0); assert.equal(records.length, 0);
});
