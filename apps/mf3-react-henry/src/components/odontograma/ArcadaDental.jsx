import { PiezaDental } from './PiezaDental.jsx';
import { AGRUPACION_CUADRANTES_FDI } from '../../constants/odontograma.constants.js';

/**
 * Organiza y renderiza las arcadas dentales y cuadrantes bajo perspectiva clínica frontal.
 *
 * Perspectiva odontológica:
 * - Lado izquierdo de la pantalla: DERECHA del paciente (Cuadrantes 1, 4, 5, 8).
 * - Lado derecho de la pantalla: IZQUIERDA del paciente (Cuadrantes 2, 3, 6, 7).
 * - Dentición permanente y temporal separadas en bloques clínicos explícitos.
 *
 * @param {object} props
 * @param {Record<number, object>} props.piezasMap - Mapa indexado de piezas por numeroFDI
 * @param {number|null} props.selectedNumeroFDI - Pieza actualmente seleccionada
 * @param {Function} props.onSelectPieza - Callback de selección
 */
export function ArcadaDental({ piezasMap = {}, selectedNumeroFDI = null, onSelectPieza }) {
  const {
    cuadrante1,
    cuadrante2,
    cuadrante3,
    cuadrante4,
    cuadrante5,
    cuadrante6,
    cuadrante7,
    cuadrante8,
  } = AGRUPACION_CUADRANTES_FDI;

  return (
    <div className="arcadas-wrapper" role="region" aria-label="Odontograma Anatómico">
      {/* ─── 1. Dentición Permanente Superior (Maxilar Superior) ─────────── */}
      <section className="arcada-section" aria-label="Maxilar Superior Permanente">
        <div className="arcada-section-title">
          <span>Maxilar Superior — Dentición Permanente (32 posiciones)</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)' }}>
            Cuadrantes 1 y 2
          </span>
        </div>

        <div className="orientacion-indicator" aria-hidden="true">
          <span>← DERECHA DEL PACIENTE (C1: 18 - 11)</span>
          <span>LÍNEA MEDIA</span>
          <span>IZQUIERDA DEL PACIENTE (C2: 21 - 28) →</span>
        </div>

        <div className="arcada-grid">
          {/* Cuadrante 1: 18 al 11 */}
          <div className="cuadrante-grupo" role="group" aria-label="Cuadrante 1 Superior Derecho Permanente">
            {cuadrante1.piezas.map((fdi) => (
              <PiezaDental
                key={fdi}
                numeroFDI={fdi}
                pieza={piezasMap[fdi]}
                isSelected={selectedNumeroFDI === fdi}
                onSelect={onSelectPieza}
              />
            ))}
          </div>

          <div className="linea-media-divisor" title="Línea Media Dental" aria-hidden="true" />

          {/* Cuadrante 2: 21 al 28 */}
          <div className="cuadrante-grupo" role="group" aria-label="Cuadrante 2 Superior Izquierdo Permanente">
            {cuadrante2.piezas.map((fdi) => (
              <PiezaDental
                key={fdi}
                numeroFDI={fdi}
                pieza={piezasMap[fdi]}
                isSelected={selectedNumeroFDI === fdi}
                onSelect={onSelectPieza}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── 2. Dentición Temporal Superior (Decidua) ────────────────────── */}
      <section className="arcada-section" aria-label="Maxilar Superior Temporal">
        <div className="arcada-section-title">
          <span>Maxilar Superior — Dentición Temporal / Decidua (20 posiciones)</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--secondary)' }}>
            Cuadrantes 5 y 6
          </span>
        </div>

        <div className="orientacion-indicator" aria-hidden="true">
          <span>← DERECHA DEL PACIENTE (C5: 55 - 51)</span>
          <span>LÍNEA MEDIA</span>
          <span>IZQUIERDA DEL PACIENTE (C6: 61 - 65) →</span>
        </div>

        <div className="arcada-grid">
          {/* Cuadrante 5: 55 al 51 */}
          <div className="cuadrante-grupo" role="group" aria-label="Cuadrante 5 Superior Derecho Temporal">
            {cuadrante5.piezas.map((fdi) => (
              <PiezaDental
                key={fdi}
                numeroFDI={fdi}
                pieza={piezasMap[fdi]}
                isSelected={selectedNumeroFDI === fdi}
                onSelect={onSelectPieza}
              />
            ))}
          </div>

          <div className="linea-media-divisor" title="Línea Media Dental" aria-hidden="true" />

          {/* Cuadrante 6: 61 al 65 */}
          <div className="cuadrante-grupo" role="group" aria-label="Cuadrante 6 Superior Izquierdo Temporal">
            {cuadrante6.piezas.map((fdi) => (
              <PiezaDental
                key={fdi}
                numeroFDI={fdi}
                pieza={piezasMap[fdi]}
                isSelected={selectedNumeroFDI === fdi}
                onSelect={onSelectPieza}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── 3. Dentición Temporal Inferior (Decidua) ────────────────────── */}
      <section className="arcada-section" aria-label="Mandíbula Temporal">
        <div className="arcada-section-title">
          <span>Mandíbula — Dentición Temporal / Decidua</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--secondary)' }}>
            Cuadrantes 8 y 7
          </span>
        </div>

        <div className="orientacion-indicator" aria-hidden="true">
          <span>← DERECHA DEL PACIENTE (C8: 85 - 81)</span>
          <span>LÍNEA MEDIA</span>
          <span>IZQUIERDA DEL PACIENTE (C7: 71 - 75) →</span>
        </div>

        <div className="arcada-grid">
          {/* Cuadrante 8: 85 al 81 */}
          <div className="cuadrante-grupo" role="group" aria-label="Cuadrante 8 Inferior Derecho Temporal">
            {cuadrante8.piezas.map((fdi) => (
              <PiezaDental
                key={fdi}
                numeroFDI={fdi}
                pieza={piezasMap[fdi]}
                isSelected={selectedNumeroFDI === fdi}
                onSelect={onSelectPieza}
              />
            ))}
          </div>

          <div className="linea-media-divisor" title="Línea Media Dental" aria-hidden="true" />

          {/* Cuadrante 7: 71 al 75 */}
          <div className="cuadrante-grupo" role="group" aria-label="Cuadrante 7 Inferior Izquierdo Temporal">
            {cuadrante7.piezas.map((fdi) => (
              <PiezaDental
                key={fdi}
                numeroFDI={fdi}
                pieza={piezasMap[fdi]}
                isSelected={selectedNumeroFDI === fdi}
                onSelect={onSelectPieza}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─── 4. Dentición Permanente Inferior (Mandíbula) ────────────────── */}
      <section className="arcada-section" aria-label="Mandíbula Permanente">
        <div className="arcada-section-title">
          <span>Mandíbula — Dentición Permanente</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)' }}>
            Cuadrantes 4 y 3
          </span>
        </div>

        <div className="orientacion-indicator" aria-hidden="true">
          <span>← DERECHA DEL PACIENTE (C4: 48 - 41)</span>
          <span>LÍNEA MEDIA</span>
          <span>IZQUIERDA DEL PACIENTE (C3: 31 - 38) →</span>
        </div>

        <div className="arcada-grid">
          {/* Cuadrante 4: 48 al 41 */}
          <div className="cuadrante-grupo" role="group" aria-label="Cuadrante 4 Inferior Derecho Permanente">
            {cuadrante4.piezas.map((fdi) => (
              <PiezaDental
                key={fdi}
                numeroFDI={fdi}
                pieza={piezasMap[fdi]}
                isSelected={selectedNumeroFDI === fdi}
                onSelect={onSelectPieza}
              />
            ))}
          </div>

          <div className="linea-media-divisor" title="Línea Media Dental" aria-hidden="true" />

          {/* Cuadrante 3: 31 al 38 */}
          <div className="cuadrante-grupo" role="group" aria-label="Cuadrante 3 Inferior Izquierdo Permanente">
            {cuadrante3.piezas.map((fdi) => (
              <PiezaDental
                key={fdi}
                numeroFDI={fdi}
                pieza={piezasMap[fdi]}
                isSelected={selectedNumeroFDI === fdi}
                onSelect={onSelectPieza}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
