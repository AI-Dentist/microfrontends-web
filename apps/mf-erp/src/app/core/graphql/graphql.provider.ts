import { EnvironmentProviders, Provider, inject } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApolloLink, InMemoryCache } from '@apollo/client/core';
import { SetContextLink } from '@apollo/client/link/context';
import { ErrorLink } from '@apollo/client/link/error';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { map } from 'rxjs';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { environment } from '../../../environments/environment';
import { AuthContextService } from '../auth/auth-context.service';
import { ERP_RUNTIME, ErpGraphqlConfig, ErpRuntimeContext } from '../runtime/erp-runtime-context';
import { prepareOperationHeaders } from './request-headers';

/** Operation context key used by forms to pass the Idempotency-Key generated on click. */
export const IDEMPOTENCY_CONTEXT_KEY = 'idempotencyKey';
export const OWNER_CONTEXT_KEY = 'ownerPrincipal';

export type { ErpGraphqlConfig };

export function provideErpGraphql(config: ErpGraphqlConfig = {}): (Provider | EnvironmentProviders)[] {
  return [
    // A hosted scope owns its runtime boundary and credential reader. Standalone root
    // instances are never shared with it, so a cached route injector cannot borrow them.
    ...(config.mode === 'hosted' ? [
      { provide: ERP_RUNTIME, useFactory: () => new ErpRuntimeContext(config) },
      AuthContextService,
    ] : []),
    provideHttpClient(withFetch()),
    provideApollo(() => {
      const httpLink = inject(HttpLink);
      const auth = inject(AuthContextService);
      const runtime = inject(ERP_RUNTIME);

      const headersLink = new SetContextLink((prevContext, operation) => {
        // Apollo schedules this callback: validate ownership at credential capture, not
        // merely before mutate(), so a tab/session switch cannot send another user's key.
        const token = auth.refresh();
        const owner = prevContext[OWNER_CONTEXT_KEY];
        if (owner !== undefined && owner !== auth.principalKey()) {
          throw new Error('La sesión cambió antes del envío; conserve la acción para su usuario original.');
        }
        const prepared = prepareOperationHeaders(
          operation.operationType, prevContext[IDEMPOTENCY_CONTEXT_KEY], prevContext.headers,
          { token, devUser: auth.devUserHeader() },
        );
        // Hosted requests only reach the bound endpoint: a caller URI override is dropped.
        return runtime.hosted ? { ...prepared, uri: undefined } : prepared;
      });

      // The capability is re-read when a response arrives: after a revocation, principal or
      // backend switch the result and its cache write are discarded. A request that was
      // already sent cannot be recalled; only its effects in this client are suppressed.
      const resultGuard = new ApolloLink((operation, forward) =>
        forward(operation).pipe(map((result) => { auth.refresh(); return result; })));

      const errorLink = new ErrorLink(({ error, operation }) => {
        if (CombinedGraphQLErrors.is(error)) {
          error.errors.forEach((e) => console.warn(`[GraphQL] ${operation.operationName}: ${e.message}`));
        } else {
          console.warn(`[Network] ${operation.operationName}: ${error.message}`);
        }
      });

      return {
        link: ApolloLink.from([
          errorLink, headersLink, ...(runtime.hosted ? [resultGuard] : []),
          // Hosted: the configured URL verbatim, never the prototype environment URL.
          httpLink.create({ uri: runtime.hosted ? runtime.endpoint ?? '' : config.graphqlUrl ?? environment.graphqlUrl }),
        ]),
        cache: new InMemoryCache(),
        defaultOptions: {
          watchQuery: { fetchPolicy: 'cache-and-network' },
          query: { fetchPolicy: 'network-only' },
        },
      };
    }),
  ];
}
