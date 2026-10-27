import { TestBed } from '@angular/core/testing';
import { SpeechRecognitionService } from './speech-recognition.service';

let instances: any[];
beforeEach(() => {
  instances = [];
  vi.stubGlobal('SpeechRecognition', class {
    lang = ''; interimResults = false; continuous = false;
    onresult: any; onerror: any; onend: any;
    start = vi.fn(); stop = vi.fn(); abort = vi.fn();
    constructor() { instances.push(this); }
  });
});
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

it('retains es-BO and the final transcript even when recognition ends', () => {
  const service = TestBed.inject(SpeechRecognitionService);
  service.start();
  expect(instances[0].lang).toBe('es-BO');
  instances[0].onresult({ results: [{ isFinal: true, 0: { transcript: 'Factura de luz' } }] });
  instances[0].onend();
  expect(service.transcript()).toBe('Factura de luz');
  expect(service.listening()).toBe(false);
});
it('cancels dictation on account change and ignores callbacks from the old recognizer', () => {
  const service = TestBed.inject(SpeechRecognitionService);
  service.start();
  const old = instances[0];
  (service as any).cancel();
  old.onresult({ results: [{ isFinal: true, 0: { transcript: 'Datos de otro usuario' } }] });
  old.onerror({ error: 'network' });
  expect(old.abort).toHaveBeenCalledOnce();
  expect(service.transcript()).toBe('');
  expect(service.error()).toBeNull();
  expect(service.listening()).toBe(false);
});
