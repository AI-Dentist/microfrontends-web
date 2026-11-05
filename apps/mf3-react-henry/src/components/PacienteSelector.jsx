import { useCallback, useContext, useEffect, useId, useRef } from 'react';
import { ClinicalServicesContext, useClinicalActivity, useClinicalState as useState } from '../context/ClinicalServices.jsx';
import { retiredRequest } from '../api/client.js';
import { Alert } from './common/Alert.jsx';
import { Input } from './common/Input.jsx';

// One selection authority for the selector AND the actual page submit handlers.
// Refs invalidate synchronously, before React renders or an abort is observed.
export function usePacienteCanonico() {
  const services = useContext(ClinicalServicesContext);
  const service = services.erpPacientesService;
  const isActive = useClinicalActivity();
  const generation = useRef(0);
  const selected = useRef(null);
  const controller = useRef(null);
  const [paciente, setPaciente] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const limpiar = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    selected.current = null;
    setPaciente(null); setLoading(false); setError(null);
  }, [setPaciente, setLoading, setError]);
  useEffect(() => () => { generation.current++; selected.current = null; controller.current?.abort(); }, [service]);
  const elegir = async id => {
    limpiar();
    if (!id || !isActive()) return;
    const version = generation.current;
    const abort = new AbortController(); controller.current = abort;
    const current = () => isActive() && version === generation.current;
    setLoading(true);
    try {
      const result = await service.validarPaciente(id, abort.signal);
      if (!current()) return;
      selected.current = result; setPaciente(result);
    } catch (err) {
      if (current() && err.name !== 'AbortError') setError(err);
    } finally { if (current()) setLoading(false); }
  };
  const validar = async (id = selected.current?.id) => {
    const version = generation.current;
    const current = () => isActive() && version === generation.current;
    if (!current()) throw retiredRequest();
    if (!service?.configured) throw Object.assign(new Error('El host no configuró el servicio de pacientes ERP.'), { detail: 'Catálogo de pacientes no disponible.' });
    if (!id || loading) throw Object.assign(new Error('Seleccione un paciente activo del catálogo ERP.'), { detail: 'Seleccione un paciente activo del catálogo ERP.' });
    try {
      await service.validarPaciente(id);
      if (!current()) throw retiredRequest();
      return { id, isCurrent: current };
    } catch (err) {
      if (!current()) throw retiredRequest();
      limpiar();
      if (err.name !== 'AbortError') setError(err);
      throw err;
    }
  };
  return { service, paciente, loading, error, limpiar, elegir, validar, isActive };
}

export function PacienteSelector({ selection, disabled = false }) {
  const searchId = useId();
  const { service, paciente, loading, error, limpiar, elegir, isActive } = selection;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searched, setSearched] = useState(false);
  const intent = useRef(0);
  useEffect(() => {
    const version = ++intent.current;
    const abort = new AbortController();
    const current = () => isActive() && intent.current === version;
    if (query.trim() && service?.configured) {
      setSearching(true); setSearchError(null);
      service.listarPacientes(query.trim(), abort.signal).then(items => {
        if (current()) { setResults(items); setSearched(true); }
      }, err => {
        if (current() && err.name !== 'AbortError') { setSearchError(err); setResults([]); }
      }).finally(() => { if (current()) setSearching(false); });
    }
    return () => { intent.current++; abort.abort(); };
  }, [query, service, isActive, setSearching, setSearchError, setResults, setSearched]);
  const changeSearch = event => {
    intent.current++;
    limpiar(); setResults([]); setSearched(false); setSearchError(null); setSearching(false);
    setQuery(event.target.value);
  };
  if (!service?.configured) return <Alert title="Catálogo de pacientes no disponible" detail="El host no configuró el servicio de pacientes ERP. Contacte al administrador." type="warning" />;
  const visibleError = error || searchError;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Input id={searchId} label="Buscar paciente ERP" aria-label="Buscar paciente ERP" value={query} onChange={changeSearch} disabled={disabled} placeholder="Nombre o apellido" />
      <label>Paciente del catálogo ERP
        <select aria-label="Paciente del catálogo ERP" value={paciente?.id || ''} onChange={event => void elegir(event.target.value)} disabled={disabled || searching}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '13px' }}>
          <option value="">Seleccione un paciente activo</option>
          {results.map(item => <option key={item.id} value={item.id}>{item.nombres} {item.apellidos} · {item.id}</option>)}
        </select>
      </label>
      <span role="status" aria-live="polite">{searching ? 'Buscando pacientes…' : loading ? 'Validando paciente…' : searched && !results.length ? 'No hay pacientes activos para esta búsqueda.' : paciente ? `Paciente seleccionado: ${paciente.nombres} ${paciente.apellidos}` : 'Seleccione un paciente activo del catálogo ERP.'}</span>
      {visibleError && <Alert title={visibleError.title || 'Error del catálogo ERP'} detail={visibleError.detail || visibleError.message} status={visibleError.status} />}
    </div>
  );
}
