function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * Idempotency-Key of one user action (one open form or modal). Double clicks and retries
 * of the same payload reuse the key so MS1 never applies them twice; once the user edits
 * the payload (e.g. after a rejection) it becomes a different action with a new key.
 */
export class IdempotentAction {
  private key: string;
  private fingerprint: string | undefined;

  constructor(private readonly factory: () => string = () => crypto.randomUUID()) {
    this.key = factory();
  }

  keyFor(variables: unknown): string {
    const fingerprint = stableStringify(variables);
    if (this.fingerprint !== undefined && this.fingerprint !== fingerprint) {
      this.key = this.factory();
    }
    this.fingerprint = fingerprint;
    return this.key;
  }

  reset(): void {
    this.key = this.factory();
    this.fingerprint = undefined;
  }
}
