export const environment = {
  production: false,
  graphqlUrl: 'http://localhost:8080/graphql',
  restApiBaseUrl: 'http://localhost:8080/api/v1',
  enableDevMockAuth: true,
  // Sent as `X-Dev-User` when no Keycloak token exists, so MS1 can run without the API Gateway.
  devUserHeader: 'admin-scz',
  defaultDevUser: {
    id: 'a1000000-0000-0000-0000-000000000001',
    username: 'admin-scz',
    nombreCompleto: 'Administrador local ERP',
    rol: 'ADMIN',
  },
};
