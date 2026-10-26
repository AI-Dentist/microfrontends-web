import { DestroyRef, Injectable, inject, signal } from '@angular/core';

interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike {
  isFinal: boolean;
  0: SpeechAlternativeLike;
}
interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export const SPEECH_LANG = 'es-BO';

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Permiso de micrófono denegado. Habilítalo en el navegador para dictar.',
  'service-not-allowed': 'Permiso de micrófono denegado. Habilítalo en el navegador para dictar.',
  'no-speech': 'No se detectó voz. Intenta nuevamente.',
  'audio-capture': 'No se encontró un micrófono disponible.',
  network: 'El reconocimiento de voz requiere conexión a internet.',
};

function resolveCtor(): SpeechRecognitionCtor | null {
  const scope = globalThis as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Thin signal-based wrapper over the Web Speech API (SpeechRecognition / webkitSpeechRecognition). */
@Injectable({ providedIn: 'root' })
export class SpeechRecognitionService {
  private readonly ctor = resolveCtor();
  private recognition: SpeechRecognitionLike | null = null;

  readonly supported = signal(this.ctor !== null);
  readonly listening = signal(false);
  readonly transcript = signal('');
  readonly error = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());
  }

  start(): void {
    if (!this.ctor || this.listening()) {
      return;
    }
    this.error.set(null);
    this.transcript.set('');
    const recognition = new this.ctor();
    recognition.lang = SPEECH_LANG;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      if (this.recognition !== recognition) return;
      let text = '';
      for (let index = 0; index < event.results.length; index++) {
        text += event.results[index][0].transcript;
      }
      this.transcript.set(text.trim());
    };
    recognition.onerror = (event) => {
      if (this.recognition !== recognition) return;
      this.error.set(ERROR_MESSAGES[event.error] ?? `Error de reconocimiento de voz (${event.error}).`);
      this.listening.set(false);
    };
    recognition.onend = () => { if (this.recognition === recognition) this.listening.set(false); };
    this.recognition = recognition;
    try {
      recognition.start();
      this.listening.set(true);
    } catch {
      this.error.set('No se pudo iniciar el reconocimiento de voz.');
    }
  }

  /** Session teardown is not normal stop: ignore late transcripts from the previous caller. */
  cancel(): void {
    const previous = this.recognition;
    this.recognition = null;
    try { previous?.abort(); } catch { /* Already ended or browser shutdown. */ }
    this.listening.set(false);
    this.transcript.set('');
    this.error.set(null);
  }

  stop(): void {
    this.recognition?.stop();
  }
}
