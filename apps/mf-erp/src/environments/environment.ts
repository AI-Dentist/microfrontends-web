import type { environment as devEnvironment } from './environment.development';

export const environment: typeof devEnvironment = {
  production: true,
  graphqlUrl: 'http://localhost:8080/graphql',
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
