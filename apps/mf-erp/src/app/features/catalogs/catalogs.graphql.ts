import { gql } from 'apollo-angular';
import type {
  ActualizarConsultorioInput, ActualizarEspecialidadInput, ActualizarUsuarioInput,
  Consultorio, Especialidad, UsuarioSistema, UUID,
} from '../../core/graphql/models';
import { CONSULTORIO_FIELDS, ESPECIALIDAD_FIELDS, USUARIO_FIELDS } from '../../core/graphql/queries.graphql';

export type { ActualizarUsuarioInput } from '../../core/graphql/models';

// Deletions are logical deactivation. Consultorio uses estado = INACTIVO, not activo.
export const ELIMINAR_PACIENTE = gql<{ eliminarPaciente: boolean }, { id: UUID }>`
  mutation EliminarPaciente($id: UUID!) {
    eliminarPaciente(id: $id)
  }
`;

export const ELIMINAR_ODONTOLOGO = gql<{ eliminarOdontologo: boolean }, { id: UUID }>`
  mutation EliminarOdontologo($id: UUID!) {
    eliminarOdontologo(id: $id)
  }
`;

export const ACTUALIZAR_ESPECIALIDAD = gql<
  { actualizarEspecialidad: Especialidad }, { id: UUID; input: ActualizarEspecialidadInput }
>`
  mutation ActualizarEspecialidad($id: UUID!, $input: ActualizarEspecialidadInput!) {
    actualizarEspecialidad(id: $id, input: $input) { ${ESPECIALIDAD_FIELDS} }
  }
`;

export const ELIMINAR_ESPECIALIDAD = gql<{ eliminarEspecialidad: boolean }, { id: UUID }>`
  mutation EliminarEspecialidad($id: UUID!) {
    eliminarEspecialidad(id: $id)
  }
`;

export const ACTUALIZAR_CONSULTORIO = gql<
  { actualizarConsultorio: Consultorio }, { id: UUID; input: ActualizarConsultorioInput }
>`
  mutation ActualizarConsultorio($id: UUID!, $input: ActualizarConsultorioInput!) {
    actualizarConsultorio(id: $id, input: $input) { ${CONSULTORIO_FIELDS} }
  }
`;

export const ELIMINAR_CONSULTORIO = gql<{ eliminarConsultorio: boolean }, { id: UUID }>`
  mutation EliminarConsultorio($id: UUID!) {
    eliminarConsultorio(id: $id)
  }
`;

export const ELIMINAR_SERVICIO_ODONTOLOGICO = gql<{ eliminarServicioOdontologico: boolean }, { id: UUID }>`
  mutation EliminarServicioOdontologico($id: UUID!) {
    eliminarServicioOdontologico(id: $id)
  }
`;

export const ACTUALIZAR_USUARIO = gql<
  { actualizarUsuario: UsuarioSistema }, { id: UUID; input: ActualizarUsuarioInput }
>`
  mutation ActualizarUsuario($id: UUID!, $input: ActualizarUsuarioInput!) {
    actualizarUsuario(id: $id, input: $input) { ${USUARIO_FIELDS} }
  }
`;
