export const DEV_IDENTITIES = [
  {
    token: 'token_dev_henry',
    nombre: 'Dr. Henry (Dev)',
    rol: 'Odontólogo Titular',
    valido: true,
  },
  {
    token: 'token_e2e_principal',
    nombre: 'Dr. Principal (E2E)',
    rol: 'Odontólogo Principal',
    valido: true,
  },
  {
    token: 'token_valido_editor',
    nombre: 'Dra. Editora',
    rol: 'Odontóloga Auditora',
    valido: true,
  },
  {
    token: 'token_invalido_test',
    nombre: 'Token Falso (Prueba 401)',
    rol: 'No Autorizado',
    valido: false,
  },
  {
    token: '',
    nombre: 'Sin Cabecera Auth (Prueba 401)',
    rol: 'Anónimo',
    valido: false,
  },
];
