import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { AuthContextService } from '../auth/auth-context.service';
import { IDEMPOTENCY_CONTEXT_KEY, OWNER_CONTEXT_KEY } from '../graphql/graphql.provider';
import { OFFLINE_REPLAYABLE_MUTATIONS, OfflineMutationName } from '../graphql/mutations.graphql';
import { IdempotentAction } from './idempotent-action';
import { classifyMutationError } from './mutation-errors';
import { NetworkStatusService } from './network-status.service';
import { OfflineSyncService } from './offline-sync.service';

type MutationData<N extends OfflineMutationName> =
  (typeof OFFLINE_REPLAYABLE_MUTATIONS)[N] extends import('@apollo/client/core').TypedDocumentNode<infer D, any> ? D : never;
type MutationVariables<N extends OfflineMutationName> =
  (typeof OFFLINE_REPLAYABLE_MUTATIONS)[N] extends import('@apollo/client/core').TypedDocumentNode<any, infer V> ? V : never;

export type CriticalMutationResult<N extends OfflineMutationName> =
  | { status: 'completed'; idempotencyKey: string; data: MutationData<N> }
  | { status: 'queued'; idempotencyKey: string };

/** Creates the Idempotency-Key for one user action (one click on "Cobrar", "Registrar"...). */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Runs a critical mutation with its Idempotency-Key. Without connection (or when MS1 cannot
 * be reached) the mutation goes to the offline queue with that same key, so the later
 * replay can never duplicate a charge.
 */
@Injectable({ providedIn: 'root' })
export class CriticalMutationService {
  private readonly apollo = inject(Apollo);
  private readonly auth = inject(AuthContextService);
  private readonly network = inject(NetworkStatusService);
  private readonly offlineSync = inject(OfflineSyncService);

  async run<N extends OfflineMutationName>(
    mutationName: N,
    variables: MutationVariables<N>,
    keyOrAction: string | IdempotentAction = newIdempotencyKey(),
  ): Promise<CriticalMutationResult<N>> {
    this.auth.refresh();
    const ownerPrincipal = this.auth.principalKey();
    if (!ownerPrincipal) throw new Error('Se requiere una sesión vigente con identidad confirmada.');
    const idempotencyKey = typeof keyOrAction === 'string' ? keyOrAction : keyOrAction.keyFor(variables);
    // The same charge is already waiting in the outbox: never create a second one.
    const duplicate = await this.offlineSync.findPendingDuplicate(mutationName, variables, ownerPrincipal);
    this.auth.refresh();
    if (this.auth.principalKey() !== ownerPrincipal) throw new Error('La sesión cambió; vuelva a iniciar la acción con su usuario original.');
    if (duplicate) {
      return { status: 'queued', idempotencyKey: duplicate.idempotencyKey };
    }
    if (!this.network.isOnline()) {
      await this.offlineSync.enqueue(mutationName, variables, idempotencyKey, ownerPrincipal);
      return { status: 'queued', idempotencyKey };
    }
    try {
      const result = await firstValueFrom(
        this.apollo.mutate({
          mutation: OFFLINE_REPLAYABLE_MUTATIONS[mutationName] as any,
          variables: variables as any,
          context: { [IDEMPOTENCY_CONTEXT_KEY]: idempotencyKey, [OWNER_CONTEXT_KEY]: ownerPrincipal },
        }),
      );
      return { status: 'completed', idempotencyKey, data: result.data as MutationData<N> };
    } catch (error) {
      if (classifyMutationError(error) === 'retryable') {
        await this.offlineSync.enqueue(mutationName, variables, idempotencyKey, ownerPrincipal);
        return { status: 'queued', idempotencyKey };
      }
      throw error;
    }
  }
}
