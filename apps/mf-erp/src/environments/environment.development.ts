export const environment = {
  production: false,
  graphqlUrl: '/api/erp/graphql',
  restApiBaseUrl: '/api/v1',
  enableDevMockAuth: true,
  // Explicit standalone development identity; API calls still traverse the Gateway.
  devUserHeader: 'admin-scz',
  defaultDevUser: {
    id: 'a1000000-0000-0000-0000-000000000001',
    username: 'admin-scz',
    nombreCompleto: 'Administrador local ERP',
    rol: 'ADMIN',
  },
};
