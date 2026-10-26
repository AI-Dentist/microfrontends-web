import { EnvironmentProviders, Provider, inject } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApolloLink, InMemoryCache } from '@apollo/client/core';
import { SetContextLink } from '@apollo/client/link/context';
import { ErrorLink } from '@apollo/client/link/error';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { environment } from '../../../environments/environment';
import { AuthContextService } from '../auth/auth-context.service';
import { prepareOperationHeaders } from './request-headers';

/** Operation context key used by forms to pass the Idempotency-Key generated on click. */
export const IDEMPOTENCY_CONTEXT_KEY = 'idempotencyKey';
export const OWNER_CONTEXT_KEY = 'ownerPrincipal';

export function provideErpGraphql(): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(withFetch()),
    provideApollo(() => {
      const httpLink = inject(HttpLink);
      const auth = inject(AuthContextService);

      const headersLink = new SetContextLink((prevContext, operation) => {
        // Apollo schedules this callback: validate ownership at credential capture, not
        // merely before mutate(), so a tab/session switch cannot send another user's key.
        const token = auth.refresh();
        const owner = prevContext[OWNER_CONTEXT_KEY];
        if (owner !== undefined && owner !== auth.principalKey()) {
          throw new Error('La sesión cambió antes del envío; conserve la acción para su usuario original.');
        }
        return prepareOperationHeaders(
          operation.operationType, prevContext[IDEMPOTENCY_CONTEXT_KEY], prevContext.headers,
          { token, devUser: auth.devUserHeader() },
        );
      });

      const errorLink = new ErrorLink(({ error, operation }) => {
        if (CombinedGraphQLErrors.is(error)) {
          error.errors.forEach((e) => console.warn(`[GraphQL] ${operation.operationName}: ${e.message}`));
        } else {
          console.warn(`[Network] ${operation.operationName}: ${error.message}`);
        }
      });

      return {
        link: ApolloLink.from([errorLink, headersLink, httpLink.create({ uri: environment.graphqlUrl })]),
        cache: new InMemoryCache(),
        defaultOptions: {
          watchQuery: { fetchPolicy: 'cache-and-network' },
          query: { fetchPolicy: 'network-only' },
        },
      };
    }),
  ];
}
