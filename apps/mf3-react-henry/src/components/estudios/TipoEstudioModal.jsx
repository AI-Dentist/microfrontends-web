/* oxlint-disable react/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.jsx';
import { Button } from '../common/Button.jsx';
import { Input } from '../common/Input.jsx';
import { Alert } from '../common/Alert.jsx';

export function TipoEstudioModal({
  isOpen,
  onClose,
  tipoEstudioAEditar,
  onGuardar,
}) {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('LABORATORIO');
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const esEdicion = Boolean(tipoEstudioAEditar);

  useEffect(() => {
    if (tipoEstudioAEditar) {
      setCodigo(tipoEstudioAEditar.codigo || '');
      setNombre(tipoEstudioAEditar.nombre || '');
      setCategoria(tipoEstudioAEditar.categoria || 'LABORATORIO');
      setDescripcion(tipoEstudioAEditar.descripcion || '');
    } else {
      setCodigo('');
      setNombre('');
      setCategoria('LABORATORIO');
      setDescripcion('');
    }
    setError(null);
  }, [tipoEstudioAEditar, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError({ title: 'Campo requerido', detail: 'El nombre del estudio es obligatorio.' });
      return;
    }
    if (!esEdicion && !codigo.trim()) {
      setError({ title: 'Campo requerido', detail: 'El código del tipo de estudio es obligatorio.' });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (esEdicion) {
        await onGuardar({
          id: tipoEstudioAEditar.id,
          payload: {
            nombre: nombre.trim(),
            descripcion: descripcion.trim(),
          },
        });
      } else {
        await onGuardar({
          payload: {
            codigo: codigo.trim().toUpperCase(),
            nombre: nombre.trim(),
            categoria,
            descripcion: descripcion.trim(),
          },
        });
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
      title={esEdicion ? '✏️ Editar Tipo de Estudio' : '➕ Nuevo Tipo de Estudio'}
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
            Código Único {esEdicion && '(Inmutable)'}:
          </label>
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Ej. RX-PANORAMICA, HEMOGRAMA, TAC-DENTAL"
            disabled={esEdicion || loading}
            required={!esEdicion}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Nombre del Estudio:
          </label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Radiografía Panorámica Digital"
            disabled={loading}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Categoría:
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            disabled={esEdicion || loading}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '14px',
            }}
          >
            <option value="LABORATORIO">🔬 LABORATORIO CLÍNICO</option>
            <option value="IMAGENOLOGIA">🩻 IMAGENOLOGÍA / RADIOLOGÍA</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
            Descripción e Indicaciones Generales:
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Detalles técnicos, preparación requerida o instrucciones para el paciente..."
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
            {esEdicion ? 'Actualizar Estudio' : 'Crear Tipo de Estudio'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
