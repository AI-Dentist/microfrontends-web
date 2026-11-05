import { Button } from '../common/Button.jsx';

const explicaciones = {
  PACIENTE_INEXISTENTE: 'El paciente no existe en el sistema de facturación.',
  ODONTOLOGO_INEXISTENTE: 'El odontólogo no existe en el sistema de facturación.',
  SERVICIO_INEXISTENTE: 'Un servicio seleccionado no existe en el catálogo.',
  SERVICIO_INACTIVO: 'Un servicio seleccionado está inactivo.',
  MONTO_INVALIDO: 'El monto de facturación es inválido.',
  PAYLOAD_INVALIDO: 'Los datos enviados para facturación son inválidos.',
  REINTENTOS_AGOTADOS: 'Los reintentos de facturación están agotados.',
};

/** Server-owned compensation: display text only, never perform a rollback. */
export function RechazoFacturacionNotice({ rechazo, onCorregir, disabled = false }) {
  if (rechazo == null) return null;
  return (
    <div className="problem-alert warning" role="alert">
      <div style={{ flex: 1 }}>
        <h4 className="problem-alert-title">Facturación rechazada: revise y vuelva a cerrar</h4>
        <p>{explicaciones[rechazo.motivoCodigo]}</p>
        <p>{rechazo.motivo}</p>
        <p>
          Fecha del rechazo: <time dateTime={rechazo.rechazadaEn}>
            {new Date(rechazo.rechazadaEn).toLocaleString()}
          </time>
        </p>
        <p>La consulta volvió a estar en curso. Sus datos clínicos se conservan.</p>
        <Button type="button" onClick={onCorregir} disabled={disabled}>
          Corregir servicios y volver a cerrar
        </Button>
      </div>
    </div>
  );
}
