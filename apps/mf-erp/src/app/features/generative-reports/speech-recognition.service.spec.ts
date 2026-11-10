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
it('announces one completion with the final transcript when recognition ends', () => {
  const service = TestBed.inject(SpeechRecognitionService);
  expect(service.completed()).toBeNull();
  service.start();
  instances[0].onresult({ results: [{ isFinal: false, 0: { transcript: 'Factura' } }] });
  expect(service.completed()).toBeNull();
  instances[0].onresult({ results: [{ isFinal: true, 0: { transcript: ' Factura de luz ' } }] });
  instances[0].onend();
  const first = service.completed();
  expect(first?.text).toBe('Factura de luz');
  instances[0].onend();
  expect(service.completed()).toBe(first);
  service.start();
  instances[1].onresult({ results: [{ isFinal: true, 0: { transcript: 'Otra' } }] });
  instances[1].onend();
  expect(service.completed()?.text).toBe('Otra');
  expect(service.completed()!.id).toBeGreaterThan(first!.id);
});
it('never announces a completion after an error, empty speech or cancellation', () => {
  const service = TestBed.inject(SpeechRecognitionService);
  service.start();
  instances[0].onresult({ results: [{ isFinal: true, 0: { transcript: 'Texto' } }] });
  instances[0].onerror({ error: 'network' });
  instances[0].onend();
  expect(service.completed()).toBeNull();
  service.start();
  instances[1].onend();
  expect(service.completed()).toBeNull();
  service.start();
  instances[2].onresult({ results: [{ isFinal: true, 0: { transcript: 'Datos de otro usuario' } }] });
  service.cancel();
  instances[2].onend();
  expect(service.completed()).toBeNull();
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
