import { gql } from 'apollo-angular';
import { DateTime, MovimientoCaja, Recibo } from '../../core/graphql/models';

export type ReadableReceipt = Omit<Recibo, 'pdfUrlS3'> & { pdfUrlS3?: string | null };
export type ReadableMovement = Omit<MovimientoCaja, 'recibo'> & { recibo: ReadableReceipt | null };
export interface ReadableCashFlow {
  totalIngresosBs: number;
  totalEgresosBs: number;
  saldoNetoBs: number;
  movimientos: ReadableMovement[];
}

/** RECEPCIONISTA can read caja but may not resolve Recibo.pdfUrlS3 at all. */
export const OBTENER_FLUJO_CAJA_SIN_PDF = gql<{ obtenerFlujoCaja: ReadableCashFlow }, { fechaInicio: DateTime; fechaFin: DateTime }>`
  query ObtenerFlujoCajaSinPdf($fechaInicio: DateTime!, $fechaFin: DateTime!) {
    obtenerFlujoCaja(fechaInicio: $fechaInicio, fechaFin: $fechaFin) {
      totalIngresosBs totalEgresosBs saldoNetoBs
      movimientos {
        id tipoMovimiento categoria metodoPago montoBs descripcion fechaMovimiento
        recibo { id numeroRecibo ciNitCliente razonSocialCliente concepto montoTotalBs enviadoWhatsapp fechaEmision }
      }
    }
  }
`;
