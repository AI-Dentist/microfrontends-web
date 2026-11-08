import { useEffect, useRef } from 'react';
import { useClinicalActivity, useClinicalServices, useClinicalState as useState } from '../../context/ClinicalServices.jsx';
import { useDevAuth } from '../../hooks/useDevAuth.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Decision support only: original image stays in memory, never in local storage. */
export function RadiographAnalysis() {
  const service = useClinicalServices('estudiosService');
  const isActive = useClinicalActivity();
  const { token } = useDevAuth();
  const [patient, setPatient] = useState('');
  const [visit, setVisit] = useState('');
  const [image, setImage] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [observation, setObservation] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const lock = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const current = id => isActive() && generation.current === id;

  function resetPatient(value) {
    generation.current++; lock.current = false;
    setPatient(value); setAnalysis(null); setHistory([]); setBusy(false); setError(''); setMessage('');
  }
  function selectFile(event) {
    const id = ++generation.current;
    lock.current = false; setBusy(false); setImage(null); setAnalysis(null); setError(''); setMessage('');
    const file = event.target.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) { setError('Seleccione una imagen JPEG, PNG o WebP.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (current(id)) setImage({ preview: String(reader.result), imagenBase64: String(reader.result).split(',')[1], mimeType: file.type });
    };
    reader.onerror = () => { if (current(id)) setError('No se pudo leer la imagen.'); };
    reader.readAsDataURL(file);
  }
  async function run(action) {
    if (lock.current) return;
    const id = ++generation.current;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(id); }
    catch (e) { if (current(id)) setError(e.detail || e.message || 'No se pudo completar la operación.'); }
    finally { if (current(id)) { lock.current = false; setBusy(false); } }
  }
  const analyze = () => image && run(async id => {
    setAnalysis(null);
    const result = await service.analizarImagen({ imagenBase64: image.imagenBase64, mimeType: image.mimeType }, token);
    if (current(id)) setAnalysis(result);
  });
  const list = () => patient.trim() && run(async id => {
    const result = await service.listarEstudiosPaciente(patient.trim(), token);
    if (current(id)) setHistory(result);
  });
  const save = () => analysis && patient.trim() && visit.trim() && run(async id => {
    await service.guardarEstudio({ pacienteId: patient.trim(), consultaId: visit.trim(),
      analisisIa: { ...analysis, observacionMedico: observation } }, token);
    if (!current(id)) return;
    setMessage('Diagnóstico asistido guardado en la historia clínica.');
    const result = await service.listarEstudiosPaciente(patient.trim(), token);
    if (current(id)) setHistory(result);
  });

  return <section aria-label="Análisis de radiografías" className="card" style={{ padding: 20 }}>
    <h2>Análisis de radiografías con IA</h2>
    <p>Apoyo al odontólogo, no un diagnóstico definitivo. Requiere revisión clínica; el modelo no cubre todas las patologías.</p>
    <label>Paciente ID <input aria-label="Paciente ID" value={patient} onChange={e => resetPatient(e.target.value)} disabled={busy} /></label>{' '}
    <label>Consulta ID <input aria-label="Consulta ID" value={visit} onChange={e => setVisit(e.target.value)} disabled={busy} /></label>
    <p><label>Subir radiografía (JPEG, PNG, WebP) <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectFile} disabled={busy} /></label></p>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {image && <div style={{ position: 'relative', width: 'fit-content', maxWidth: '100%' }}>
      <img src={image.preview} alt="Radiografía seleccionada" style={{ display: 'block', maxWidth: '100%', maxHeight: 600 }} />
      {analysis?.hallazgos?.map((finding, index) => finding.boundingBox && <span key={index} data-detection={finding.etiqueta} title={finding.etiqueta}
        style={{ position: 'absolute', pointerEvents: 'none', border: '2px solid #e11d48', boxSizing: 'border-box',
          left: `${finding.boundingBox.x * 100}%`, top: `${finding.boundingBox.y * 100}%`,
          width: `${finding.boundingBox.width * 100}%`, height: `${finding.boundingBox.height * 100}%` }} />)}
    </div>}
    <p><button type="button" data-action="analyze" disabled={!image || busy} onClick={analyze}>Analizar Radiografía con IA (TensorFlow)</button></p>
    {analysis && <article aria-label="Resultados asistidos">
      <h3>{analysis.modeloNombre} · {analysis.version}</h3>
      <p>{analysis.aviso}</p>
      <p>Confianza global: {Math.round(analysis.confianzaGlobal * 100)}% · Severidad máxima: <strong>{analysis.severidadMaxima}</strong></p>
      {analysis.hallazgos.map((finding, index) => <section key={index} style={{ borderBottom: '1px solid #cbd5e1', padding: 8 }}>
        <h4>{finding.etiqueta}</h4>
        <progress aria-label={`Confianza ${finding.etiqueta}`} value={finding.probabilidad} max="1" /> {Math.round(finding.probabilidad * 100)}%
        <p>Severidad: <strong className="badge">{finding.severidad}</strong> · Zona: {finding.zonaSugerida}</p>
        <p>{finding.recomendacionClinica}</p>
      </section>)}
      {!!analysis.etiquetasNoSoportadas?.length && <p role="note">Etiquetas no soportadas (no evaluadas): {analysis.etiquetasNoSoportadas.join(', ')}</p>}
      <label>Observación del odontólogo <textarea value={observation} onChange={e => setObservation(e.target.value)} disabled={busy} /></label>
      <p><button type="button" data-action="save" disabled={busy || !patient.trim() || !visit.trim()} onClick={save}>Guardar diagnóstico asistido</button></p>
    </article>}
    <button type="button" disabled={busy || !patient.trim()} onClick={list}>Consultar historial de análisis</button>
    <div data-history="true"><h3>Historial de análisis del paciente</h3>
      {history.length === 0 ? <p>Sin análisis cargados.</p> : history.map(record => <article key={record.id || record._id}>
        <strong>{record.analisisIa?.modeloNombre}</strong> · {record.analisisIa?.fechaInferencia}
        <p>{record.analisisIa?.observacionMedico}</p>
        {record.analisisIa?.hallazgos?.map((finding, index) => <p key={index}>{finding.etiqueta} · {Math.round(finding.probabilidad * 100)}% · {finding.severidad} · {finding.zonaSugerida}</p>)}
      </article>)}
    </div>
  </section>;
}
