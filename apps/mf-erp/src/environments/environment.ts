import type { environment as devEnvironment } from './environment.development';

export const environment: typeof devEnvironment = {
  production: true,
  graphqlUrl: '/api/erp/graphql',
  restApiBaseUrl: '/api/v1',
  enableDevMockAuth: false,
  devUserHeader: '',
  defaultDevUser: {
    id: '',
    username: '',
    nombreCompleto: '',
    rol: '',
  },
};
