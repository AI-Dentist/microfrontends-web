import { gql } from 'apollo-angular';
import type { TypedDocumentNode } from '@apollo/client/core';
import type { ReporteGenerativoPayload } from '../../core/graphql/models';

export type TipoColumnaReporte = 'TEXTO' | 'NUMERO' | 'MONEDA_BS' | 'FECHA' | 'FECHA_HORA' | 'BOOLEANO';

export interface ColumnaReporte {
  clave: string;
  etiqueta: string;
  tipo: TipoColumnaReporte | string;
}

export interface EntidadReporte {
  clave: string;
  nombre: string;
  origen: string;
  columnas: ColumnaReporte[];
  filtrosEstado: string[];
  filtroFecha: boolean;
}

export interface ReporteManualInput {
  entidad: string;
  columnas: string[];
  fechaInicio?: string | null;
  fechaFin?: string | null;
  estado?: string | null;
}

export interface ListarEntidadesReporteResponse {
  listarEntidadesReporte: EntidadReporte[];
}

export interface GenerarReporteManualResponse {
  generarReporteManual: ReporteGenerativoPayload;
}

export const LISTAR_ENTIDADES_REPORTE: TypedDocumentNode<
  ListarEntidadesReporteResponse,
  Record<string, never>
> = gql`
  query ListarEntidadesReporte {
    listarEntidadesReporte {
      clave
      nombre
      origen
      columnas {
        clave
        etiqueta
        tipo
      }
      filtrosEstado
      filtroFecha
    }
  }
`;

export const GENERAR_REPORTE_MANUAL: TypedDocumentNode<
  GenerarReporteManualResponse,
  { input: ReporteManualInput }
> = gql`
  mutation GenerarReporteManual($input: ReporteManualInput!) {
    generarReporteManual(input: $input) {
      reporteId
      consultaSqlEjecutada
      sqlGenerado
      titulo
      resumenAnalitico
      columnas
      filas
      filasJson
      tipoGraficoSugerido
      urlDescargaExcel
      urlDescargaPdf
      filasTruncadas
    }
  }
`;
