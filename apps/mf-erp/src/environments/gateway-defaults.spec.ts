import { environment } from './environment';
import { environment as development } from './environment.development';
it('uses only same-origin gateway public routes by default in production and development', () => {
  for (const config of [environment, development]) {
    expect(config.graphqlUrl).toBe('/api/erp/graphql');
    expect(config.restApiBaseUrl).toBe('/api/v1');
  }
});
