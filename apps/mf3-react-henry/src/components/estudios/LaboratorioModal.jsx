/* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Input } from '../common/Input.jsx';
import { Alert } from '../common/Alert.jsx';

export function LaboratorioModal({
  isOpen,
  onClose,
  laboratorioAEditar,
  onGuardar,
}) {
  const [nombre, setNombre] = useState('');
  const [contacto, setContacto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const esEdicion = Boolean(laboratorioAEditar);

  useEffect(() => {
    if (laboratorioAEditar) {
      setNombre(laboratorioAEditar.nombre || '');
      setContacto(laboratorioAEditar.contacto || '');
      setDescripcion(laboratorioAEditar.descripcion || '');
    } else {
      setNombre('');
      setContacto('');
      setDescripcion('');
    }
    setError(null);
  }, [laboratorioAEditar, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError({ title: 'Campo requerido', detail: 'El nombre del laboratorio es obligatorio.' });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = {
        nombre: nombre.trim(),
        contacto: contacto.trim() || null,
        descripcion: descripcion.trim(),
      };
      if (esEdicion) {
        await onGuardar({ id: laboratorioAEditar.id, payload });
      } else {
        await onGuardar({ payload });
      }
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={esEdicion ? '✏️ Editar Laboratorio' : '🏥 Registrar Nuevo Laboratorio'}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <Alert
            title={error.title}
            detail={error.detail}
            status={error.status}
            invalidParams={error.invalidParams}
            onClose={() => setError(null)}
          />
        )}

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Nombre del Laboratorio / Centro de Diagnóstico:
          </label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Laboratorio Clínico Central, Lab Dental 3D"
            disabled={loading}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Información de Contacto (Teléfono, Email, Dirección):
          </label>
          <Input
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            placeholder="Ej. Av. Central 456, Tel: 555-0199, contacto@labdental.com"
            disabled={loading}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Descripción o Especialidades:
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Especialidad en patología bucal, análisis bioquímicos, tomografía cone-beam..."
            rows={3}
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              resize: 'vertical',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
          <Button variant="secondary" onClick={onClose} type="button" disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            {esEdicion ? 'Guardar Cambios' : 'Registrar Laboratorio'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
