import { Injectable, Injector, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { OWNER_CONTEXT_KEY } from '../graphql/graphql.provider';
import { OBTENER_MI_USUARIO_ID } from '../graphql/queries.graphql';
import { ERP_RUNTIME, ErpRuntimeContext } from '../runtime/erp-runtime-context';
import { AuthContextService } from './auth-context.service';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_CASHIER = 'Solo ADMIN o CAJERO pueden realizar operaciones financieras.';
const UNCONFIRMED = 'No se pudo confirmar su usuario cajero ERP. No se envió ninguna operación financiera.';

interface Lease { principal: string; id: Promise<string> }

/**
 * Cache of one hosted lease. It is keyed by the lease's runtime, so it lives and dies with the
 * route provider scope that owns that runtime and is never shared with another lease.
 */
const leases = new WeakMap<ErpRuntimeContext, Lease>();

/**
 * Canonical financial `Usuario.id` of the caller. A hosted scope asks the backend once per lease
 * (`obtenerMiUsuarioId`, no arguments); standalone keeps the configured dev-mock mapping.
 * It never derives the id from the JWT subject, the dev default in a hosted scope or a doctor.
 */
@Injectable()
export class FinancialIdentityService {
  private readonly auth = inject(AuthContextService);
  // Looked up on demand: only a hosted scope needs it, and it comes from the route injector.
  private readonly injector = inject(Injector);
  private readonly runtime = inject(ERP_RUNTIME);

  async resolve(): Promise<string> {
    if (!this.runtime.hosted) return this.auth.requireFinancialUserId();
    try {
      // Throws (and retires the lease) when the host capability is gone or the principal changed.
      this.auth.refresh();
    } catch (error) {
      leases.delete(this.runtime);
      throw error;
    }
    const principal = this.auth.principalKey();
    if (!principal || !this.auth.roles().some((role) => role === 'ADMIN' || role === 'CAJERO')) throw new Error(NOT_CASHIER);
    const cached = leases.get(this.runtime);
    if (cached?.principal === principal) return cached.id;
    const id = this.lookup(principal);
    const lease = { principal, id };
    leases.set(this.runtime, lease);
    // A failure is never cached: the next attempt asks the backend again.
    id.catch(() => { if (leases.get(this.runtime) === lease) leases.delete(this.runtime); });
    return id;
  }

  private async lookup(principal: string): Promise<string> {
    const result = await firstValueFrom(this.injector.get(Apollo).query({
      query: OBTENER_MI_USUARIO_ID, fetchPolicy: 'network-only', context: { [OWNER_CONTEXT_KEY]: principal },
    }));
    // A late answer must not outlive a revocation or principal switch.
    this.auth.refresh();
    if (this.auth.principalKey() !== principal) throw new Error(UNCONFIRMED);
    if (!this.auth.roles().some((role) => role === 'ADMIN' || role === 'CAJERO')) throw new Error(NOT_CASHIER);
    const id = result.data?.obtenerMiUsuarioId;
    if (typeof id !== 'string' || !UUID_SHAPE.test(id)) throw new Error(UNCONFIRMED);
    return id;
  }
}
