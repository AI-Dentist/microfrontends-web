/**
 * Leyenda clínica accesible que explica las convenciones cromáticas y abreviaturas del odontograma.
 */
export function LeyendaClinica() {
  return (
    <div className="leyenda-clinica" role="complementary" aria-label="Leyenda de convenciones del odontograma">
      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
        📖 Convenciones y Simbología Clínica
      </div>

      <div className="leyenda-grid">
        {/* Estados Anatómicos */}
        <div className="leyenda-columna">
          <span className="leyenda-columna-titulo">Estados Anatómicos</span>
          <div className="leyenda-item">
            <span className="pieza-badge-estado pieza-estado-desconocido">?</span>
            <span>Desconocido (No explorado)</span>
          </div>
          <div className="leyenda-item">
            <span className="pieza-badge-estado pieza-estado-presente">PRES</span>
            <span>Presente en boca</span>
          </div>
          <div className="leyenda-item">
            <span className="pieza-badge-estado pieza-estado-ausente">AUS</span>
            <span>Ausente congénito (Agenesia)</span>
          </div>
          <div className="leyenda-item">
            <span className="pieza-badge-estado pieza-estado-extraido">EXT</span>
            <span>Extraído / Pérdida previa</span>
          </div>
          <div className="leyenda-item">
            <span className="pieza-badge-estado pieza-estado-no-erupcionado">N/E</span>
            <span>No erupcionado / Retenido</span>
          </div>
        </div>

        {/* Condiciones de Superficie */}
        <div className="leyenda-columna">
          <span className="leyenda-columna-titulo">Condición por Superficie</span>
          <div className="leyenda-item">
            <span className="leyenda-muestra" style={{ backgroundColor: '#f1f5f9', borderStyle: 'dashed' }} />
            <span>No evaluada (Basal)</span>
          </div>
          <div className="leyenda-item">
            <span className="leyenda-muestra" style={{ backgroundColor: '#dcfce7', borderColor: '#86efac' }} />
            <span>Sana (Sin lesión confirmada)</span>
          </div>
          <div className="leyenda-item">
            <span className="leyenda-muestra" style={{ backgroundColor: '#fee2e2', borderColor: '#fca5a5' }} />
            <span>Caries activa</span>
          </div>
          <div className="leyenda-item">
            <span className="leyenda-muestra" style={{ backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' }} />
            <span>Obturación resina</span>
          </div>
          <div className="leyenda-item">
            <span className="leyenda-muestra" style={{ backgroundColor: '#cbd5e1', borderColor: '#64748b' }} />
            <span>Obturación amalgama</span>
          </div>
          <div className="leyenda-item">
            <span className="leyenda-muestra" style={{ backgroundColor: '#ffedd5', borderColor: '#fdba74' }} />
            <span>Fractura dental</span>
          </div>
          <div className="leyenda-item">
            <span className="leyenda-muestra" style={{ backgroundColor: '#fef3c7', borderColor: '#fde68a' }} />
            <span>Sellante de fosas</span>
          </div>
        </div>

        {/* Indicadores y Tratamientos */}
        <div className="leyenda-columna">
          <span className="leyenda-columna-titulo">Tratamientos Estructurales</span>
          <div className="leyenda-item">
            <span className="punto-indicador punto-caries" />
            <span>Punto rojo: Lesión activa o fractura</span>
          </div>
          <div className="leyenda-item">
            <span className="punto-indicador punto-obturacion" />
            <span>Punto azul: Restauración o sellante</span>
          </div>
          <div className="leyenda-item">
            <span className="punto-indicador punto-tratamiento" />
            <span>Punto púrpura: Corona / Endodoncia / Implante</span>
          </div>

          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
            ⚠️ <em>Regla clínica:</em> Las 52 posiciones representan sitios FDI posibles. <strong>DESCONOCIDO</strong> no equivale a sano, y <strong>NO_EVALUADA</strong> no confirma ausencia de patología.
          </div>
        </div>
      </div>
    </div>
  );
}
