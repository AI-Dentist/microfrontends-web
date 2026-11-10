import { gql } from 'apollo-angular';

export type MetodoPago = 'EFECTIVO' | 'QR_PAGOFACIL' | 'TRANSFERENCIA';

export interface KpiSerieDia {
  fecha: string; // Date YYYY-MM-DD
  montoBs: number;
}

export interface KpiIngresos {
  totalBs: number;
  cantidadMovimientos: number;
  montoNominalQrBs: number;
  seriePorDia: KpiSerieDia[];
}

export interface KpiCuotaVencida {
  cuotaId: string; // UUID
  ordenCobroId: string; // UUID
  pacienteId: string; // UUID
  pacienteNombre: string;
  numeroCuota: number;
  montoBs: number;
  fechaVencimiento: string; // Date YYYY-MM-DD
  diasAtraso: number;
}

export interface KpiMorosidad {
  cuotasVencidas: number;
  cuotasExigibles: number;
  porcentaje: number;
  montoVencidoBs: number;
  detalle: KpiCuotaVencida[];
}

export interface KpiServicioRanking {
  servicioId: string; // UUID
  nombre: string;
  cantidad: number;
  montoBs: number;
}

export interface KpiFlujoDia {
  fecha: string; // Date YYYY-MM-DD
  ingresosBs: number;
  egresosBs: number;
  saldoBs: number;
}

export interface KpiFlujoCaja {
  totalIngresosBs: number;
  totalEgresosBs: number;
  saldoNetoBs: number;
  seriePorDia: KpiFlujoDia[];
}

export interface KpiCobranzaMetodo {
  metodoPago: MetodoPago;
  cantidad: number;
  montoBs: number;
  porcentajeMonto: number;
  montoNominal: boolean;
}

export interface KpisFinancieros {
  fechaInicio: string; // DateTime ISO
  fechaFin: string; // DateTime ISO
  ingresos: KpiIngresos;
  morosidad: KpiMorosidad;
  serviciosMasSolicitados: KpiServicioRanking[];
  flujoCaja: KpiFlujoCaja;
  cobranzaPorMetodo: KpiCobranzaMetodo[];
}

export interface ObtenerKpisFinancierosResponse {
  obtenerKpisFinancieros: KpisFinancieros;
}

export interface ObtenerKpisFinancierosVariables {
  fechaInicio: string;
  fechaFin: string;
}

export const OBTENER_KPIS_FINANCIEROS = gql`
  query ObtenerKpisFinancieros($fechaInicio: DateTime!, $fechaFin: DateTime!) {
    obtenerKpisFinancieros(fechaInicio: $fechaInicio, fechaFin: $fechaFin) {
      fechaInicio
      fechaFin
      ingresos {
        totalBs
        cantidadMovimientos
        montoNominalQrBs
        seriePorDia {
          fecha
          montoBs
        }
      }
      morosidad {
        cuotasVencidas
        cuotasExigibles
        porcentaje
        montoVencidoBs
        detalle {
          cuotaId
          ordenCobroId
          pacienteId
          pacienteNombre
          numeroCuota
          montoBs
          fechaVencimiento
          diasAtraso
        }
      }
      serviciosMasSolicitados {
        servicioId
        nombre
        cantidad
        montoBs
      }
      flujoCaja {
        totalIngresosBs
        totalEgresosBs
        saldoNetoBs
        seriePorDia {
          fecha
          ingresosBs
          egresosBs
          saldoBs
        }
      }
      cobranzaPorMetodo {
        metodoPago
        cantidad
        montoBs
        porcentajeMonto
        montoNominal
      }
    }
  }
`;
