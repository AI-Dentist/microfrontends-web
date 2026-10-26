import { HttpErrorResponse } from '@angular/common/http';
import { CombinedGraphQLErrors, UnconventionalError } from '@apollo/client/errors';
import { classifyMutationError } from './mutation-errors';

describe('classifyMutationError', () => {
  it('treats GraphQL business errors as permanent', () => {
    const error = new CombinedGraphQLErrors({ errors: [{ message: 'La cuota ya fue pagada' }] });
    expect(classifyMutationError(error)).toBe('business');
  });

  it('recognizes authentication classification while keeping FORBIDDEN and BAD_REQUEST terminal', () => {
    const error = (classification: string, code?: string) => new CombinedGraphQLErrors({ errors: [{ message: 'rechazado', extensions: { classification, code } }] });
    expect(classifyMutationError(error('UNAUTHENTICATED'))).toBe('retryable');
    expect(classifyMutationError(error('FORBIDDEN', 'UNAUTHENTICATED'))).toBe('business');
    expect(classifyMutationError(error('BAD_REQUEST'))).toBe('business');
  });

  it('retries when the browser could not reach MS1', () => {
    expect(classifyMutationError(new TypeError('Failed to fetch'))).toBe('retryable');
    expect(classifyMutationError(new UnconventionalError(new HttpErrorResponse({ status: 0 })))).toBe('retryable');
  });

  it('retries server failures, timeouts and in-flight idempotency conflicts', () => {
    expect(classifyMutationError(new HttpErrorResponse({ status: 503 }))).toBe('retryable');
    expect(classifyMutationError(new HttpErrorResponse({ status: 408 }))).toBe('retryable');
    expect(classifyMutationError(new HttpErrorResponse({ status: 409 }))).toBe('retryable');
  });

  it('retries when the session expired while offline, so the charge waits for a new login', () => {
    expect(classifyMutationError(new HttpErrorResponse({ status: 401 }))).toBe('retryable');
  });

  it('treats other client errors as permanent', () => {
    expect(classifyMutationError(new HttpErrorResponse({ status: 403 }))).toBe('business');
    expect(classifyMutationError(new HttpErrorResponse({ status: 400 }))).toBe('business');
    expect(classifyMutationError(new UnconventionalError(new HttpErrorResponse({ status: 422 })))).toBe('business');
  });
});
