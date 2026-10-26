import { CombinedGraphQLErrors } from '@apollo/client/errors';

/** business: MS1 rejected the operation for good. retryable: it may succeed later with the same key. */
export type MutationErrorKind = 'business' | 'retryable';

// 401: the token expired while offline; the record waits for a fresh login instead of failing.
const RETRYABLE_STATUS = new Set([0, 401, 408, 409, 425, 429]);

function httpStatusOf(error: unknown): number | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const candidate = current as { status?: unknown; statusCode?: unknown; cause?: unknown; errorType?: unknown };
    const status = candidate.status ?? candidate.statusCode;
    if (typeof status === 'number') {
      return status;
    }
    current = candidate.cause ?? candidate.errorType;
  }
  return undefined;
}

export function classifyMutationError(error: unknown): MutationErrorKind {
  if (CombinedGraphQLErrors.is(error)) {
    const codes = error.errors.flatMap((e) => [e.extensions?.['code'], e.extensions?.['classification']]);
    if (codes.includes('FORBIDDEN') || codes.includes('BAD_REQUEST')) return 'business';
    if (codes.includes('UNAUTHENTICATED')) return 'retryable';
    return 'business';
  }
  const status = httpStatusOf(error);
  if (status === undefined) {
    // No HTTP response at all (DNS, CORS, connection reset): MS1 never answered.
    return 'retryable';
  }
  return RETRYABLE_STATUS.has(status) || status >= 500 ? 'retryable' : 'business';
}

export function describeError(error: unknown): string {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors.map((e) => e.message).join('; ');
  }
  return error instanceof Error ? error.message : String(error);
}
