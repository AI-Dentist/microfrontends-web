import { HttpHeaders } from '@angular/common/http';

export interface RequestIdentity {
  token: string | null;
  devUser: string | null;
  idempotencyKey?: string;
}

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const DEV_USER_HEADER = 'X-Dev-User';

/** Builds the HTTP headers MS1 expects for one GraphQL operation. */
export function buildRequestHeaders({ token, devUser, idempotencyKey }: RequestIdentity): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (devUser) {
    headers[DEV_USER_HEADER] = devUser;
  }
  if (idempotencyKey) {
    headers[IDEMPOTENCY_HEADER] = idempotencyKey;
  }
  return headers;
}

/** Merge operation headers without changing caller objects or action identity. */
export function prepareOperationHeaders(
  operationType: string,
  contextKey: unknown,
  existing: HttpHeaders | Record<string, string> | undefined,
  identity: RequestIdentity,
): { headers: Record<string, string>; idempotencyKey: string | undefined } {
  const entries: [string, string[]][] = existing instanceof HttpHeaders
    ? existing.keys().map((name) => [name, existing.getAll(name) ?? []])
    : Object.entries(existing ?? {}).map(([name, value]) => [name, [value]]);
  const headers: Record<string, string> = {};
  const explicit: unknown[] = contextKey === undefined ? [] : [contextKey];
  for (const [name, values] of entries) {
    const lower = name.toLowerCase();
    if (lower === 'idempotency-key' && operationType === 'mutation') {
      explicit.push(...values);
    } else if (lower !== 'authorization' && lower !== 'x-dev-user') {
      headers[name] = values.join(',');
    }
  }
  if (operationType === 'mutation' && (explicit.some((key) => typeof key !== 'string' || !key.trim()) ||
      new Set(explicit).size > 1)) {
    throw new Error('Idempotency-Key explícita vacía o en conflicto.');
  }
  const idempotencyKey = resolveIdempotencyKey(operationType, explicit[0] as string | undefined);
  return { idempotencyKey, headers: { ...headers, ...buildRequestHeaders({ ...identity, idempotencyKey }) } };
}

/**
 * Auth headers may only travel to MS1. Download URLs returned by the backend are checked
 * against the configured API bases so a foreign host never receives the Bearer token.
 */
export function isTrustedApiUrl(url: string, trustedBases: readonly string[], currentOrigin: string): boolean {
  try {
    const target = new URL(url, currentOrigin);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return false;
    }
    return trustedBases.some((base) => new URL(base, currentOrigin).origin === target.origin);
  } catch {
    return false;
  }
}

/**
 * Mutations always travel with an Idempotency-Key: the one generated when the user
 * clicked the button (so retries and offline replays reuse it) or a fresh one.
 */
export function resolveIdempotencyKey(
  operationType: string,
  contextKey: string | undefined,
  factory: () => string = () => crypto.randomUUID(),
): string | undefined {
  if (operationType !== 'mutation') {
    return undefined;
  }
  return contextKey ?? factory();
}
