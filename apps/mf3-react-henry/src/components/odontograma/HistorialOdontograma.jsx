import { useState } from 'react';
import { Badge } from '../common/Badge.jsx';
import { Button } from '../common/Button.jsx';
import { Spinner } from '../common/Spinner.jsx';
import { TIPO_REVISION_ODONTOGRAMA } from '../../constants/odontograma.constants.js';

/**
 * Componente que presenta el Historial Longitudinal de Revisiones del Odontograma (Iteración 7F-4A).
 *
 * Características:
 * - Lista paginada con navegación anterior/siguiente y selector de tamaño de página.
 * - Distinción estricta de fechas: fechaRegistro vs fechaObservacionClinica.
 * - Identificación clara de NUEVA_OBSERVACION vs ENMIENDA_CORRECTIVA.
 * - Indicador de impacto en el estado actual (aplicaAlEstadoActual).
 * - Referencia a consulta clínica asociada (consultaId) y odontólogo responsable.
 * - Selección de revisión para visualización de snapshot inmutable.
 *
 * @param {object} props
 * @param {string} props.odontogramaId - Identificador canónico del odontograma
 * @param {object} props.historial - Objeto paginado { total, limite, offset, revisiones }
 * @param {boolean} [props.loading=false] - Estado de carga de la paginación
 * @param {Function} props.onCargarPagina - Callback (offset, limite) => void
 * @param {Function} props.onSeleccionarRevision - Callback (revision) => void
 * @param {string} [props.consultaIdFiltro] - Identificador de consulta clínica en contexto
 * @param {Array<object>} [props.revisionesConsulta] - Revisiones filtradas por consulta
 */
export function HistorialOdontograma({
  _odontogramaId,
  historial = { total: 0, limite: 20, offset: 0, revisiones: [] },
  loading = false,
  onCargarPagina,
  onSeleccionarRevision,
  consultaIdFiltro = '',
  revisionesConsulta = [],
}) {
  const [soloEstaConsulta, setSoloEstaConsulta] = useState(false);

  const { total = 0, limite = 20, offset = 0, revisiones = [] } = historial;

  // Si se activa el filtro por consulta y hay revisiones vinculadas, mostrar esa lista
  const listaMostrar =
    soloEstaConsulta && consultaIdFiltro
      ? revisionesConsulta
      : revisiones;

  const totalElementos =
    soloEstaConsulta && consultaIdFiltro
      ? revisionesConsulta.length
      : total;

  const paginaActual = Math.floor(offset / limite) + 1;
  const totalPaginas = Math.ceil(totalElementos / limite) || 1;
  const desde = totalElementos === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + limite, totalElementos);

  const handlePaginaAnterior = () => {
    if (offset > 0 && onCargarPagina) {
      const nuevoOffset = Math.max(0, offset - limite);
      onCargarPagina(nuevoOffset, limite);
    }
  };

  const handlePaginaSiguiente = () => {
    if (offset + limite < totalElementos && onCargarPagina) {
      const nuevoOffset = offset + limite;
      onCargarPagina(nuevoOffset, limite);
    }
  };

  const handleCambiarLimite = (e) => {
    const nuevoLimite = Number(e.target.value);
    if (onCargarPagina) {
      onCargarPagina(0, nuevoLimite);
    }
  };

  return (
    <section className="historial-odontograma-container" aria-label="Historial del odontograma">
      {/* Encabezado del Historial */}
      <div className="historial-header">
        <div>
          <h3 className="historial-title">
            <span>📜</span>
            <span>Historial Longitudinal del Odontograma</span>
          </h3>
          <p className="historial-subtitle">
            Secuencia inmutable de revisiones, nuevas observaciones y enmiendas auditables registradas para este expediente.
          </p>
        </div>

        {/* Filtro contextual por Consulta Odontológica */}
        {consultaIdFiltro && (
          <div className="historial-filtro-consulta">
            <label className="checkbox-label" style={{ fontSize: '12px' }}>
              <input
                type="checkbox"
                checked={soloEstaConsulta}
                onChange={(e) => setSoloEstaConsulta(e.target.checked)}
              />
              <span>Filtrar solo consulta activa ({consultaIdFiltro})</span>
            </label>
          </div>
        )}
      </div>

      {/* Barra de control y paginación superior */}
      <div className="historial-toolbar">
        <div className="historial-contador">
          {totalElementos > 0 ? (
            <span>
              Mostrando <strong>{desde}–{hasta}</strong> de <strong>{totalElementos}</strong> revisiones
            </span>
          ) : (
            <span>Sin revisiones disponibles</span>
          )}
        </div>

        <div className="historial-paginacion-controles">
          <label htmlFor="selectorLimiteRevisiones" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Por página:
          </label>
          <select
            id="selectorLimiteRevisiones"
            className="form-input"
            value={limite}
            onChange={handleCambiarLimite}
            disabled={loading || soloEstaConsulta}
            style={{ width: 'auto', padding: '3px 8px', fontSize: '12px' }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>

          <Button
            variant="secondary"
            onClick={handlePaginaAnterior}
            disabled={offset === 0 || loading || soloEstaConsulta}
            style={{ fontSize: '12px', padding: '4px 10px' }}
            aria-label="Página anterior de revisiones"
          >
            ← Anterior
          </Button>

          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '0 4px' }}>
            Pág. {paginaActual} / {totalPaginas}
          </span>

          <Button
            variant="secondary"
            onClick={handlePaginaSiguiente}
            disabled={offset + limite >= totalElementos || loading || soloEstaConsulta}
            style={{ fontSize: '12px', padding: '4px 10px' }}
            aria-label="Página siguiente de revisiones"
          >
            Siguiente →
          </Button>
        </div>
      </div>

      {/* Estado de carga */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
          <Spinner dark />
          <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
            Consultando historial longitudinal de revisiones...
          </p>
        </div>
      )}

      {/* Estado vacío */}
      {!loading && listaMostrar.length === 0 && (
        <div className="empty-state" style={{ padding: '32px 16px', background: 'var(--bg-surface)' }}>
          <div className="empty-state-icon">📋</div>
          <h4 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>
            No se encontraron revisiones registradas
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, maxWidth: '440px' }}>
            {soloEstaConsulta
              ? `No se han registrado revisiones durante la consulta ${consultaIdFiltro}.`
              : 'El expediente no cuenta con historial de revisiones odontográficas.'}
          </p>
        </div>
      )}

      {/* Lista de tarjetas de revisiones históricas */}
      {!loading && listaMostrar.length > 0 && (
        <ul className="historial-lista" role="list">
          {listaMostrar.map((rev) => {
            const esEnmienda = rev.tipoRevision === TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA;
            const tieneDeltas = Array.isArray(rev.cambiosAplicados) && rev.cambiosAplicados.length > 0;
            const totalDeltas = tieneDeltas ? rev.cambiosAplicados.length : 0;

            return (
              <li key={rev.id} className="revision-card-item">
                <div className="revision-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="revision-numero-badge">
                      Rev #{rev.numeroRevision}
                    </span>

                    <Badge variant={esEnmienda ? 'warning' : 'primary'}>
                      {esEnmienda ? 'Enmienda Correctiva' : 'Nueva Observación'}
                    </Badge>

                    {rev.aplicaAlEstadoActual ? (
                      <Badge variant="success" style={{ fontSize: '11px' }}>
                        ✓ Afecta estado actual
                      </Badge>
                    ) : (
                      <Badge variant="secondary" style={{ fontSize: '11px' }}>
                        🔒 Retrospectiva (sin alterar presente)
                      </Badge>
                    )}

                    {rev.consultaId && (
                      <span className="revision-consulta-tag" title="Consulta odontológica asociada">
                        🦷 Consulta: <code>{rev.consultaId}</code>
                      </span>
                    )}
                  </div>

                  <Button
                    variant="primary"
                    onClick={() => onSeleccionarRevision && onSeleccionarRevision(rev)}
                    style={{ fontSize: '12px', padding: '4px 12px' }}
                    title={`Ver snapshot anatómico de la revisión #${rev.numeroRevision}`}
                  >
                    👁️ Ver Snapshot Histórico
                  </Button>
                </div>

                {/* Justificación / Motivo clínico */}
                <div className="revision-motivo">
                  <strong>Motivo clínico:</strong> {rev.motivoRevision || 'Sin justificación registrada'}
                </div>

                {/* Referencia a corrección previa si es enmienda */}
                {esEnmienda && rev.revisionCorregidaId && (
                  <div className="revision-referencia-enmienda">
                    ⚠️ <strong>Rectifica formalmente a la revisión:</strong> <code>{rev.revisionCorregidaId}</code>
                  </div>
                )}

                {/* Metadatos cronológicos y profesionales */}
                <div className="revision-meta-footer">
                  <span>
                    📅 <strong>Obs. clínica:</strong>{' '}
                    {rev.fechaObservacionClinica
                      ? new Date(rev.fechaObservacionClinica).toLocaleString()
                      : 'No especificada'}
                  </span>

                  <span>
                    ⏰ <strong>Registrado en servidor:</strong>{' '}
                    {rev.fechaRegistro
                      ? new Date(rev.fechaRegistro).toLocaleString()
                      : 'No especificada'}
                  </span>

                  {rev.registradoPor && (
                    <span>
                      👨‍⚕️ <strong>Profesional:</strong> {rev.registradoPor}
                    </span>
                  )}

                  <span>
                    📊 <strong>Cambios aplicados:</strong> {totalDeltas} {totalDeltas === 1 ? 'pieza' : 'piezas'}
                  </span>

                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    ID: <code>{rev.id}</code>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
