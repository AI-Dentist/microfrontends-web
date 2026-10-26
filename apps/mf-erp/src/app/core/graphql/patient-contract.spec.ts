import { buildSchema, print } from 'graphql';
import { MS1_SCHEMA_SDL } from './ms1-schema';
import { LISTAR_PACIENTES, OBTENER_PACIENTE_POR_ID } from './queries.graphql';
import { CREAR_PACIENTE, ACTUALIZAR_PACIENTE } from './mutations.graphql';

it('reads nullable demographics in every patient selection without adding input id/activo', () => {
  const schema = buildSchema(MS1_SCHEMA_SDL);
  const patient = schema.getType('Paciente') as import('graphql').GraphQLObjectType;
  expect(String(patient.getFields()['fechaNacimiento']?.type)).toBe('Date');
  expect(String(patient.getFields()['genero']?.type)).toBe('String');
  for (const document of [LISTAR_PACIENTES, OBTENER_PACIENTE_POR_ID, CREAR_PACIENTE, ACTUALIZAR_PACIENTE]) {
    expect(print(document)).toContain('fechaNacimiento');
    expect(print(document)).toContain('genero');
  }
  for (const name of ['CrearPacienteInput', 'ActualizarPacienteInput']) {
    const input = schema.getType(name) as import('graphql').GraphQLInputObjectType;
    expect(input.getFields()).not.toHaveProperty('id');
    expect(input.getFields()).not.toHaveProperty('activo');
  }
});
