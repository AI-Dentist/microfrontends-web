import { useState } from 'react';
import { historiasClinicasService } from '../../api/historias-clinicas.service.js';
import { useDevAuth } from '../../hooks/useDevAuth.js';
import { Card } from '../common/Card.jsx';
import { Input } from '../common/Input.jsx';
import { Button } from '../common/Button.jsx';
import { Alert } from '../common/Alert.jsx';

export function MedicamentosManager({
  historia,
  onMedicamentosActualizados,
  onRecargarExpediente,
}) {
  const { token } = useDevAuth();

  // Lista local editable de medicamentos inicializada desde la historia clínica
  const [listaMedicamentos, setListaMedicamentos] = useState(() => {
    if (historia?.medicamentosActuales) {
      return historia.medicamentosActuales.map((m) => ({
        nombre: m.nombre || '',
        principioActivo: m.principioActivo || '',
        dosis: m.dosis || '',
        motivoUso: m.motivoUso || '',
        prescritoDesde: m.prescritoDesde ? m.prescritoDesde.substring(0, 10) : '',
      }));
    }
    return [];
  });
  const [descripcionAuditoria, setDescripcionAuditoria] = useState(
    'Actualización de esquema farmacológico habitual.',
  );

  // Estados para nuevo medicamento temporal en el formulario
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoPrincipioActivo, setNuevoPrincipioActivo] = useState('');
  const [nuevaDosis, setNuevaDosis] = useState('');
  const [nuevoMotivoUso, setNuevoMotivoUso] = useState('');
  const [nuevaFechaDesde, setNuevaFechaDesde] = useState('');

  // Estados de operación
  const [saving, setSaving] = useState(false);
  const [errorOperacion, setErrorOperacion] = useState(null);
  const [mensajeExito, setMensajeExito] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);

  if (!historia) return null;

  const isEditable = historia.estado === 'ACTIVA';

  // Agregar fármaco a la lista borrador
  const handleAgregarALista = (e) => {
    e.preventDefault();
    setValidationErrors([]);
    setErrorOperacion(null);
    setMensajeExito('');

    const nombreLimpio = nuevoNombre.trim();
    const dosisLimpia = nuevaDosis.trim();

    const errores = [];
    if (!nombreLimpio) errores.push('El nombre comercial o denominación del medicamento es obligatorio.');
    if (!dosisLimpia) errores.push('La dosis y frecuencia prescrita son obligatorias.');

    if (errores.length > 0) {
      setValidationErrors(errores);
      return;
    }

    const nuevoItem = {
      nombre: nombreLimpio,
      principioActivo: nuevoPrincipioActivo.trim() || null,
      dosis: dosisLimpia,
      motivoUso: nuevoMotivoUso.trim() || null,
      prescritoDesde: nuevaFechaDesde ? new Date(nuevaFechaDesde).toISOString() : null,
    };

    setListaMedicamentos((prev) => [...prev, nuevoItem]);

    // Limpiar campos del sub-formulario
    setNuevoNombre('');
    setNuevoPrincipioActivo('');
    setNuevaDosis('');
    setNuevoMotivoUso('');
    setNuevaFechaDesde('');
  };

  // Quitar fármaco de la lista borrador
  const handleQuitarDeLista = (index) => {
    setListaMedicamentos((prev) => prev.filter((_, idx) => idx !== index));
    setMensajeExito('');
  };

  // Editar campo directo en la lista borrador
  const handleModificarCampo = (index, campo, valor) => {
    setListaMedicamentos((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [campo]: valor } : item)),
    );
    setMensajeExito('');
  };

  // Guardar lista completa en backend vía PUT
  const handleGuardarMedicamentos = async () => {
    setValidationErrors([]);
    setErrorOperacion(null);
    setMensajeExito('');

    // Validar cada elemento de la lista borrador
    const errores = [];
    listaMedicamentos.forEach((med, i) => {
      if (!med.nombre || !med.nombre.trim()) {
        errores.push(`Medicamento #${i + 1}: el nombre es obligatorio.`);
      }
      if (!med.dosis || !med.dosis.trim()) {
        errores.push(`Medicamento #${i + 1} (${med.nombre || 'Sin nombre'}): la dosis es obligatoria.`);
      }
    });

    if (errores.length > 0) {
      setValidationErrors(errores);
      return;
    }

    const payload = {
      versionEsperada: historia.version,
      medicamentos: listaMedicamentos.map((m) => ({
        nombre: m.nombre.trim(),
        principioActivo: m.principioActivo?.trim() || null,
        dosis: m.dosis.trim(),
        motivoUso: m.motivoUso?.trim() || null,
        prescritoDesde: m.prescritoDesde
          ? new Date(m.prescritoDesde).toISOString()
          : null,
      })),
      descripcion: descripcionAuditoria.trim() || null,
    };

    setSaving(true);
    try {
      const historiaActualizada = await historiasClinicasService.actualizarMedicamentos(
        historia.id,
        payload,
        token,
      );
      setMensajeExito(
        `Listado de medicamentos actualizado exitosamente (Versión del expediente incrementada a v${historiaActualizada.version}).`,
      );
      if (onMedicamentosActualizados) {
        onMedicamentosActualizados(historiaActualizada);
      }
    } catch (err) {
      setErrorOperacion(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Alerta de no editable si el expediente no está activo */}
      {!isEditable && (
        <div
          style={{
            background: 'var(--warning-bg)',
            border: '1px solid var(--warning-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            color: 'var(--warning)',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          🔒 Expediente en estado <strong>{historia.estado}</strong>: Modo de solo lectura clínica.
          No se permite actualizar los medicamentos habituales a menos que el expediente sea reactivado a estado ACTIVA.
        </div>
      )}

      {/* Mensaje Informativo sobre la operación PUT */}
      <div
        style={{
          background: 'var(--neutral-50)',
          borderLeft: '4px solid var(--primary)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}
      >
        <strong style={{ color: 'var(--text-primary)' }}>ℹ️ Información del Contrato REST (PUT):</strong>{' '}
        Esta operación reemplaza la lista completa de medicamentos habituales del paciente.
        Todos los fármacos presentes en la tabla inferior serán conservados al guardar. Puede agregar nuevos medicamentos o quitar aquellos que el paciente ya no consuma antes de confirmar el guardado.
      </div>

      {/* Errores de operación del backend */}
      {errorOperacion && (
        <div>
          <Alert
            title={errorOperacion.title}
            detail={errorOperacion.detail}
            status={errorOperacion.status}
            invalidParams={errorOperacion.invalidParams}
            onClose={() => setErrorOperacion(null)}
          />
          {errorOperacion.status === 409 && onRecargarExpediente && (
            <div style={{ marginTop: '10px' }}>
              <Button variant="secondary" onClick={onRecargarExpediente}>
                🔄 Recargar versión más reciente del expediente
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Errores de validación estructural */}
      {validationErrors.length > 0 && (
        <div
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: '13px',
            color: 'var(--danger)',
          }}
        >
          <strong>Corrija los siguientes errores antes de guardar:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Mensaje de éxito */}
      {mensajeExito && (
        <div
          style={{
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            fontSize: '13px',
            color: 'var(--success)',
            fontWeight: 600,
          }}
        >
          ✓ {mensajeExito}
        </div>
      )}

      {/* Formulario para agregar fármaco a la lista borrador */}
      <Card title="Agregar Medicamento al Esquema">
        <form onSubmit={handleAgregarALista} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <Input
              label="Nombre Comercial / Fármaco *"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Ej. Losartán 50mg, Amoxicilina"
              disabled={!isEditable || saving}
            />

            <Input
              label="Principio Activo"
              value={nuevoPrincipioActivo}
              onChange={(e) => setNuevoPrincipioActivo(e.target.value)}
              placeholder="Ej. Losartán potásico"
              disabled={!isEditable || saving}
            />

            <Input
              label="Dosis y Frecuencia *"
              value={nuevaDosis}
              onChange={(e) => setNuevaDosis(e.target.value)}
              placeholder="Ej. 1 comprimido cada 12 horas"
              disabled={!isEditable || saving}
            />

            <Input
              label="Motivo de Uso / Diagnóstico"
              value={nuevoMotivoUso}
              onChange={(e) => setNuevoMotivoUso(e.target.value)}
              placeholder="Ej. Hipertensión arterial"
              disabled={!isEditable || saving}
            />

            <Input
              label="Fecha de Inicio / Prescrito Desde"
              type="date"
              value={nuevaFechaDesde}
              onChange={(e) => setNuevaFechaDesde(e.target.value)}
              disabled={!isEditable || saving}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="secondary"
              disabled={!isEditable || saving || !nuevoNombre.trim() || !nuevaDosis.trim()}
              style={{ fontSize: '13px' }}
            >
              ➕ Añadir a la Lista
            </Button>
          </div>
        </form>
      </Card>

      {/* Tabla de Medicamentos a Guardar */}
      <Card
        title={`Esquema Farmacológico Actual (${listaMedicamentos.length} fármacos)`}
        action={
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'var(--neutral-100)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Versión esperada: <strong>v{historia.version}</strong>
          </span>
        }
      >
        {listaMedicamentos.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
            No hay medicamentos en el esquema actual. Si guarda, se registrará que el paciente no consume medicamentos habituales.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="clinic-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Medicamento *</th>
                  <th>Principio Activo</th>
                  <th>Dosis y Frecuencia *</th>
                  <th>Motivo de Uso</th>
                  <th>Desde</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {listaMedicamentos.map((med, idx) => (
                  <tr key={idx}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{idx + 1}</td>
                    <td>
                      <input
                        type="text"
                        value={med.nombre}
                        disabled={!isEditable || saving}
                        onChange={(e) => handleModificarCampo(idx, 'nombre', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          fontSize: '13px',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={med.principioActivo || ''}
                        disabled={!isEditable || saving}
                        onChange={(e) =>
                          handleModificarCampo(idx, 'principioActivo', e.target.value)
                        }
                        placeholder="Opcional"
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          fontSize: '13px',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={med.dosis}
                        disabled={!isEditable || saving}
                        onChange={(e) => handleModificarCampo(idx, 'dosis', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          fontSize: '13px',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={med.motivoUso || ''}
                        disabled={!isEditable || saving}
                        onChange={(e) => handleModificarCampo(idx, 'motivoUso', e.target.value)}
                        placeholder="Opcional"
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          fontSize: '13px',
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {med.prescritoDesde ? med.prescritoDesde.substring(0, 10) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        disabled={!isEditable || saving}
                        onClick={() => handleQuitarDeLista(idx)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--danger)',
                          cursor: isEditable ? 'pointer' : 'not-allowed',
                          fontSize: '16px',
                          padding: '4px',
                        }}
                        title="Quitar este fármaco de la lista"
                      >
                        ❌
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Justificación de Auditoría para la Actualización Farmacológica (Opcional)"
            value={descripcionAuditoria}
            onChange={(e) => setDescripcionAuditoria(e.target.value)}
            disabled={!isEditable || saving}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button
              onClick={handleGuardarMedicamentos}
              loading={saving}
              disabled={!isEditable || saving}
            >
              💾 Guardar Lista Completa de Medicamentos (PUT v{historia.version})
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
