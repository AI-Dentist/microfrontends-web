import { useState, useEffect, useCallback } from 'react';
import { Card } from '../common/Card.jsx';
import { Button } from '../common/Button.jsx';
import { Input } from '../common/Input.jsx';
import { Badge } from '../common/Badge.jsx';
import { Alert } from '../common/Alert.jsx';
import { EstadoConsultaBadge } from './EstadoConsultaBadge.jsx';
import {
  esPiezaFDIValida,
  obtenerDescripcionPiezaFDI,
  LISTADO_PIEZAS_FDI,
} from '../../utils/fdi-validator.js';
import { consultasOdontologicasService } from '../../api/consultas-odontologicas.service.js';
import { useDevAuth } from '../../hooks/useDevAuth.js';

/**
 * Formulario clínico de alta fidelidad para el registro y actualización de
 * la atención odontológica en sillón dental (Iteración 6F-2).
 * Incluye resolución segura y explícita de conflictos de concurrencia optimista HTTP 409.
 *
 * @param {object} props
 * @param {object} props.consulta - ConsultaOdontologicaResponseDto actual
 * @param {Function} props.onGuardar - Callback async (payload) => Promise<ConsultaOdontologicaResponseDto|null>
 * @param {Function} [props.onRecargar] - Callback para forzar recarga fresca del servidor
 * @param {Function} [props.onConsultarServidor] - Callback para consultar la versión actual en servidor
 * @param {Function} [props.onActualizarConsulta] - Callback para sincronizar el estado de la consulta en el componente padre
 * @param {Function} [props.onVolver] - Callback para regresar a la vista de detalle
 * @param {boolean} [props.loading] - Estado de carga externo
 * @param {object} [props.externalError] - Error RFC 7807 del hook
 * @param {Function} [props.onResetError] - Callback para limpiar el error externo
 */
export function AtencionConsultaForm({
  consulta,
  onGuardar,
  onRecargar,
  onConsultarServidor,
  onActualizarConsulta,
  onVolver,
  loading: externalLoading = false,
  externalError = null,
  onResetError,
}) {
  const { token } = useDevAuth();

  // Consulta activa en formulario y detección de cambio de id
  const [consultaActual, setConsultaActual] = useState(consulta);
  const [prevConsultaId, setPrevConsultaId] = useState(consulta?.id);

  // Estados de Concurrencia Optimista HTTP 409
  const [conflictoCerrado, setConflictoCerrado] = useState(false);
  const [conflictoServidorData, setConflictoServidorData] = useState(null);
  const [cargandoServidor, setCargandoServidor] = useState(false);
  const [errorCargaServidor, setErrorCargaServidor] = useState(null);
  const [mostrarComparador, setMostrarComparador] = useState(false);
  const [resolucionMensaje, setResolucionMensaje] = useState('');
  const [bloqueadaPorOtraSesion, setBloqueadaPorOtraSesion] = useState(null);
  const [mostrarConfirmacionDescarte, setMostrarConfirmacionDescarte] = useState(false);

  // Derivar si el conflicto 409 está activo
  const conflictoActivo = !conflictoCerrado && Boolean(externalError && externalError.status === 409);

  // Regla INV-CONS-04: Si la consulta está COMPLETADA o CANCELADA en el objeto recibido
  // o si detectamos que otra sesión la cerró/canceló, se bloquea la edición por completo.
  const estadoEfectivo = bloqueadaPorOtraSesion?.estado || consultaActual?.estado || consulta?.estado;
  const isReadOnly = estadoEfectivo === 'COMPLETADA' || estadoEfectivo === 'CANCELADA';

  // ─── Estado del Borrador Clínico Local ─────────────────────────────────────
  const [versionEsperada, setVersionEsperada] = useState(consulta?.version || 1);
  const [motivoConsulta, setMotivoConsulta] = useState(consulta?.motivoConsulta || '');

  // 1. Anamnesis Actual
  const [anamnesisDescripcion, setAnamnesisDescripcion] = useState(
    consulta?.anamnesisActual?.descripcion || '',
  );
  const [tiempoEvolucion, setTiempoEvolucion] = useState(
    consulta?.anamnesisActual?.tiempoEvolucion || '',
  );
  const [escalaDolorEVA, setEscalaDolorEVA] = useState(() => {
    const eva = consulta?.anamnesisActual?.escalaDolorEVA;
    return eva !== null && eva !== undefined ? String(eva) : '';
  });

  // 2. Exploración Física
  const [inspeccionExtraoral, setInspeccionExtraoral] = useState(
    consulta?.exploracionFisica?.inspeccionExtraoral || '',
  );
  const [inspeccionIntraoral, setInspeccionIntraoral] = useState(
    consulta?.exploracionFisica?.inspeccionIntraoral || '',
  );
  const [hallazgosDentales, setHallazgosDentales] = useState(
    consulta?.exploracionFisica?.hallazgosDentales || '',
  );

  // 3. Diagnósticos Clínicos (Borrador de lista)
  const [diagnosticos, setDiagnosticos] = useState(() => {
    return (consulta?.diagnosticos || []).map((d) => ({
      codigoCIE10: d.codigoCIE10 || '',
      descripcion: d.descripcion || '',
      tipo: d.tipo || 'PRESUNTIVO',
    }));
  });

  // Campos para nuevo diagnóstico rápido
  const [nuevoDiagCodigo, setNuevoDiagCodigo] = useState('');
  const [nuevoDiagDesc, setNuevoDiagDesc] = useState('');
  const [nuevoDiagTipo, setNuevoDiagTipo] = useState('PRESUNTIVO');

  // 4. Procedimientos Realizados en Sillón
  const [procedimientos, setProcedimientos] = useState(() => {
    return (consulta?.procedimientosRealizados || []).map((p) => ({
      codigo: p.codigo || '',
      descripcion: p.descripcion || '',
      piezaDental: p.piezaDental !== null && p.piezaDental !== undefined ? String(p.piezaDental) : '',
      observaciones: p.observaciones || '',
    }));
  });

  // Campos para nuevo procedimiento rápido
  const [nuevoProcCodigo, setNuevoProcCodigo] = useState('');
  const [nuevoProcDesc, setNuevoProcDesc] = useState('');
  const [nuevoProcPieza, setNuevoProcPieza] = useState('');
  const [nuevoProcObs, setNuevoProcObs] = useState('');

  // 5. Evolución SOAP
  const [soapSubjetivo, setSoapSubjetivo] = useState(
    consulta?.evolucionSOAP?.subjetivo || '',
  );
  const [soapObjetivo, setSoapObjetivo] = useState(
    consulta?.evolucionSOAP?.objetivo || '',
  );
  const [soapAnalisis, setSoapAnalisis] = useState(
    consulta?.evolucionSOAP?.analisis || '',
  );
  const [soapPlan, setSoapPlan] = useState(
    consulta?.evolucionSOAP?.plan || '',
  );

  // 6. Recomendaciones Terapéuticas
  const [recomendaciones, setRecomendaciones] = useState(
    consulta?.recomendaciones || '',
  );

  // Estados de control del formulario
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activeSection, setActiveSection] = useState('todas');

  // Re-inicializar si cambia la consulta cargada (cambio de id canónico)
  if (consulta?.id && consulta.id !== prevConsultaId) {
    setPrevConsultaId(consulta.id);
    setConsultaActual(consulta);
    setVersionEsperada(consulta.version || 1);
    setMotivoConsulta(consulta.motivoConsulta || '');
    setAnamnesisDescripcion(consulta.anamnesisActual?.descripcion || '');
    setTiempoEvolucion(consulta.anamnesisActual?.tiempoEvolucion || '');
    setEscalaDolorEVA(
      consulta.anamnesisActual?.escalaDolorEVA != null
        ? String(consulta.anamnesisActual.escalaDolorEVA)
        : '',
    );
    setInspeccionIntraoral(consulta.exploracionFisica?.inspeccionIntraoral || '');
    setInspeccionExtraoral(consulta.exploracionFisica?.inspeccionExtraoral || '');
    setHallazgosDentales(consulta.exploracionFisica?.hallazgosDentales || '');
    setDiagnosticos(
      (consulta.diagnosticos || []).map((d) => ({
        codigoCIE10: d.codigoCIE10 || '',
        descripcion: d.descripcion || '',
        tipo: d.tipo || 'PRESUNTIVO',
      })),
    );
    setProcedimientos(
      (consulta.procedimientosRealizados || []).map((p) => ({
        codigo: p.codigo || '',
        descripcion: p.descripcion || '',
        piezaDental: p.piezaDental != null ? String(p.piezaDental) : '',
        observaciones: p.observaciones || '',
      })),
    );
    setSoapSubjetivo(consulta.evolucionSOAP?.subjetivo || '');
    setSoapObjetivo(consulta.evolucionSOAP?.objetivo || '');
    setSoapAnalisis(consulta.evolucionSOAP?.analisis || '');
    setSoapPlan(consulta.evolucionSOAP?.plan || '');
    setRecomendaciones(consulta.recomendaciones || '');
    setConflictoActivo(false);
    setConflictoServidorData(null);
    setMostrarComparador(false);
    setResolucionMensaje('');
    setBloqueadaPorOtraSesion(null);
  }

  // Si la consulta externa cambió de estado a COMPLETADA o CANCELADA, reflejarlo
  if (
    consulta &&
    consulta.id === prevConsultaId &&
    consulta.estado !== consultaActual?.estado
  ) {
    setConsultaActual(consulta);
  }

  /**
   * Consulta la versión actual del servidor sin sobrescribir el borrador local.
   * Permite inspeccionar si la consulta fue modificada, completada o cancelada.
   */
  const verificarEstadoServidor = useCallback(async () => {
    const idConsulta = consulta?.id || consultaActual?.id;
    if (!idConsulta) return;

    setCargandoServidor(true);
    setErrorCargaServidor(null);

    try {
      let serverData = null;
      if (onConsultarServidor) {
        serverData = await onConsultarServidor(idConsulta);
      } else {
        serverData = await consultasOdontologicasService.getById(idConsulta, token);
      }

      if (!serverData) {
        setErrorCargaServidor('No fue posible obtener la versión actual del servidor.');
        return;
      }

      setConflictoServidorData(serverData);

      // Requisito 6: Si otra sesión completó o canceló la consulta, bloquear toda edición
      if (serverData.estado === 'COMPLETADA' || serverData.estado === 'CANCELADA') {
        setBloqueadaPorOtraSesion(serverData);
        setConsultaActual(serverData);
        if (onActualizarConsulta) {
          onActualizarConsulta(serverData);
        }
        return;
      }

      // Si sigue EN_CURSO, desplegar el comparador para resolución asistida
      setMostrarComparador(true);
    } catch (err) {
      setErrorCargaServidor(err.message || 'Error al comunicarse con el servidor para verificar versión.');
    } finally {
      setCargandoServidor(false);
    }
  }, [consulta?.id, consultaActual?.id, onConsultarServidor, onActualizarConsulta, token]);

  // Reaccionar a errores 409 emitidos externamente consultando el servidor de forma asíncrona
  useEffect(() => {
    let cancelado = false;
    if (externalError && externalError.status === 409 && !conflictoServidorData && !cargandoServidor) {
      const sincronizarServidor = async () => {
        const idConsulta = consulta?.id || consultaActual?.id;
        if (!idConsulta) return;
        try {
          let serverData = null;
          if (onConsultarServidor) {
            serverData = await onConsultarServidor(idConsulta);
          } else {
            serverData = await consultasOdontologicasService.getById(idConsulta, token);
          }
          if (cancelado) return;
          if (serverData) {
            setConflictoServidorData(serverData);
            if (serverData.estado === 'COMPLETADA' || serverData.estado === 'CANCELADA') {
              setBloqueadaPorOtraSesion(serverData);
              setConsultaActual(serverData);
              if (onActualizarConsulta) onActualizarConsulta(serverData);
            } else {
              setMostrarComparador(true);
            }
          }
        } catch (err) {
          if (!cancelado) {
            setErrorCargaServidor(err.message || 'Error al comunicarse con el servidor.');
          }
        }
      };
      void sincronizarServidor();
    }
    return () => {
      cancelado = true;
    };
  }, [
    externalError,
    conflictoServidorData,
    cargandoServidor,
    consulta?.id,
    consultaActual?.id,
    onConsultarServidor,
    onActualizarConsulta,
    token,
  ]);

  // Diferencias campo a campo entre el borrador local y el servidor
  const difMotivo =
    conflictoServidorData &&
    motivoConsulta.trim() !== (conflictoServidorData.motivoConsulta || '').trim();

  const difAnamnesis =
    conflictoServidorData &&
    (anamnesisDescripcion.trim() !==
      (conflictoServidorData.anamnesisActual?.descripcion || '').trim() ||
      tiempoEvolucion.trim() !==
        (conflictoServidorData.anamnesisActual?.tiempoEvolucion || '').trim() ||
      escalaDolorEVA !==
        (conflictoServidorData.anamnesisActual?.escalaDolorEVA != null
          ? String(conflictoServidorData.anamnesisActual.escalaDolorEVA)
          : ''));

  const difExploracion =
    conflictoServidorData &&
    (inspeccionIntraoral.trim() !==
      (conflictoServidorData.exploracionFisica?.inspeccionIntraoral || '').trim() ||
      inspeccionExtraoral.trim() !==
        (conflictoServidorData.exploracionFisica?.inspeccionExtraoral || '').trim() ||
      hallazgosDentales.trim() !==
        (conflictoServidorData.exploracionFisica?.hallazgosDentales || '').trim());

  const difSOAP =
    conflictoServidorData &&
    (soapSubjetivo.trim() !==
      (conflictoServidorData.evolucionSOAP?.subjetivo || '').trim() ||
      soapObjetivo.trim() !==
        (conflictoServidorData.evolucionSOAP?.objetivo || '').trim() ||
      soapAnalisis.trim() !==
        (conflictoServidorData.evolucionSOAP?.analisis || '').trim() ||
      soapPlan.trim() !==
        (conflictoServidorData.evolucionSOAP?.plan || '').trim());

  const difRecomendaciones =
    conflictoServidorData &&
    recomendaciones.trim() !==
      (conflictoServidorData.recomendaciones || '').trim();

  // Métodos de adopción selectiva de campos desde el servidor
  const handleAdoptarMotivoServidor = () => {
    if (!conflictoServidorData) return;
    setMotivoConsulta(conflictoServidorData.motivoConsulta || '');
  };

  const handleAdoptarAnamnesisServidor = () => {
    if (!conflictoServidorData) return;
    setAnamnesisDescripcion(conflictoServidorData.anamnesisActual?.descripcion || '');
    setTiempoEvolucion(conflictoServidorData.anamnesisActual?.tiempoEvolucion || '');
    setEscalaDolorEVA(
      conflictoServidorData.anamnesisActual?.escalaDolorEVA != null
        ? String(conflictoServidorData.anamnesisActual.escalaDolorEVA)
        : '',
    );
  };

  const handleAdoptarExploracionServidor = () => {
    if (!conflictoServidorData) return;
    setInspeccionIntraoral(conflictoServidorData.exploracionFisica?.inspeccionIntraoral || '');
    setInspeccionExtraoral(conflictoServidorData.exploracionFisica?.inspeccionExtraoral || '');
    setHallazgosDentales(conflictoServidorData.exploracionFisica?.hallazgosDentales || '');
  };

  const handleAdoptarDiagnosticosServidor = () => {
    if (!conflictoServidorData) return;
    setDiagnosticos(
      (conflictoServidorData.diagnosticos || []).map((d) => ({
        codigoCIE10: d.codigoCIE10 || '',
        descripcion: d.descripcion || '',
        tipo: d.tipo || 'PRESUNTIVO',
      })),
    );
  };

  const handleAdoptarProcedimientosServidor = () => {
    if (!conflictoServidorData) return;
    setProcedimientos(
      (conflictoServidorData.procedimientosRealizados || []).map((p) => ({
        codigo: p.codigo || '',
        descripcion: p.descripcion || '',
        piezaDental: p.piezaDental != null ? String(p.piezaDental) : '',
        observaciones: p.observaciones || '',
      })),
    );
  };

  const handleAdoptarSOAPServidor = () => {
    if (!conflictoServidorData) return;
    setSoapSubjetivo(conflictoServidorData.evolucionSOAP?.subjetivo || '');
    setSoapObjetivo(conflictoServidorData.evolucionSOAP?.objetivo || '');
    setSoapAnalisis(conflictoServidorData.evolucionSOAP?.analisis || '');
    setSoapPlan(conflictoServidorData.evolucionSOAP?.plan || '');
  };

  const handleAdoptarRecomendacionesServidor = () => {
    if (!conflictoServidorData) return;
    setRecomendaciones(conflictoServidorData.recomendaciones || '');
  };

  // Resolución consciente y segura: sincronizar versión esperada a la real del servidor
  const handleAceptarResolucion = () => {
    if (!conflictoServidorData?.version) return;
    setVersionEsperada(conflictoServidorData.version);
    setConsultaActual(conflictoServidorData);
    if (onActualizarConsulta) {
      onActualizarConsulta(conflictoServidorData);
    }
    setConflictoCerrado(true);
    setMostrarComparador(false);
    setResolucionMensaje(
      `Resolución completada: la versión esperada se ha sincronizado a v${conflictoServidorData.version}. Revise su borrador final antes de enviar la actualización.`,
    );
    if (onResetError) {
      onResetError();
    }
  };

  // Reemplazar todo el borrador por la versión del servidor
  const handleDescartarBorradorYAdoptarServidor = () => {
    if (!conflictoServidorData) return;
    setMotivoConsulta(conflictoServidorData.motivoConsulta || '');
    setAnamnesisDescripcion(conflictoServidorData.anamnesisActual?.descripcion || '');
    setTiempoEvolucion(conflictoServidorData.anamnesisActual?.tiempoEvolucion || '');
    setEscalaDolorEVA(
      conflictoServidorData.anamnesisActual?.escalaDolorEVA != null
        ? String(conflictoServidorData.anamnesisActual.escalaDolorEVA)
        : '',
    );
    setInspeccionIntraoral(conflictoServidorData.exploracionFisica?.inspeccionIntraoral || '');
    setInspeccionExtraoral(conflictoServidorData.exploracionFisica?.inspeccionExtraoral || '');
    setHallazgosDentales(conflictoServidorData.exploracionFisica?.hallazgosDentales || '');
    setDiagnosticos(
      (conflictoServidorData.diagnosticos || []).map((d) => ({
        codigoCIE10: d.codigoCIE10 || '',
        descripcion: d.descripcion || '',
        tipo: d.tipo || 'PRESUNTIVO',
      })),
    );
    setProcedimientos(
      (conflictoServidorData.procedimientosRealizados || []).map((p) => ({
        codigo: p.codigo || '',
        descripcion: p.descripcion || '',
        piezaDental: p.piezaDental != null ? String(p.piezaDental) : '',
        observaciones: p.observaciones || '',
      })),
    );
    setSoapSubjetivo(conflictoServidorData.evolucionSOAP?.subjetivo || '');
    setSoapObjetivo(conflictoServidorData.evolucionSOAP?.objetivo || '');
    setSoapAnalisis(conflictoServidorData.evolucionSOAP?.analisis || '');
    setSoapPlan(conflictoServidorData.evolucionSOAP?.plan || '');
    setRecomendaciones(conflictoServidorData.recomendaciones || '');
    setVersionEsperada(conflictoServidorData.version);
    setConsultaActual(conflictoServidorData);
    if (onActualizarConsulta) {
      onActualizarConsulta(conflictoServidorData);
    }
    setConflictoCerrado(true);
    setMostrarComparador(false);
    setMostrarConfirmacionDescarte(false);
    setResolucionMensaje(
      `Borrador descartado. Se han cargado todos los datos de la versión v${conflictoServidorData.version} del servidor.`,
    );
    if (onResetError) {
      onResetError();
    }
  };

  const handleCerrarComparador = () => {
    setMostrarComparador(false);
  };

  if (!consulta) return null;

  // ─── Manejadores de Diagnósticos ──────────────────────────────────────────
  const handleAgregarDiagnostico = (e) => {
    if (e) e.preventDefault();
    if (!nuevoDiagDesc.trim()) {
      setValidationError('La descripción del diagnóstico es obligatoria.');
      return;
    }
    setValidationError('');
    setDiagnosticos((prev) => [
      ...prev,
      {
        codigoCIE10: nuevoDiagCodigo.trim() ? nuevoDiagCodigo.trim().toUpperCase() : null,
        descripcion: nuevoDiagDesc.trim(),
        tipo: nuevoDiagTipo,
      },
    ]);
    setNuevoDiagCodigo('');
    setNuevoDiagDesc('');
    setNuevoDiagTipo('PRESUNTIVO');
  };

  const handleEliminarDiagnostico = (index) => {
    setDiagnosticos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCambiarDiagnostico = (index, field, value) => {
    setDiagnosticos((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  };

  // ─── Manejadores de Procedimientos ────────────────────────────────────────
  const handleAgregarProcedimiento = (e) => {
    if (e) e.preventDefault();
    if (!nuevoProcDesc.trim()) {
      setValidationError('La descripción del procedimiento es obligatoria.');
      return;
    }

    if (nuevoProcPieza.trim() && !esPiezaFDIValida(nuevoProcPieza.trim())) {
      setValidationError(
        `La pieza dental ${nuevoProcPieza.trim()} no es válida bajo la nomenclatura FDI (11 a 85, 52 piezas anatómicas).`,
      );
      return;
    }

    setValidationError('');
    setProcedimientos((prev) => [
      ...prev,
      {
        codigo: nuevoProcCodigo.trim() ? nuevoProcCodigo.trim().toUpperCase() : null,
        descripcion: nuevoProcDesc.trim(),
        piezaDental: nuevoProcPieza.trim() ? Number(nuevoProcPieza.trim()) : null,
        observaciones: nuevoProcObs.trim() || null,
      },
    ]);
    setNuevoProcCodigo('');
    setNuevoProcDesc('');
    setNuevoProcPieza('');
    setNuevoProcObs('');
  };

  const handleEliminarProcedimiento = (index) => {
    setProcedimientos((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Envío y Serialización del Payload ────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnly) return;

    // Si hay un conflicto activo pendiente de resolución, obligar a resolverlo antes
    if (conflictoActivo) {
      setValidationError(
        'Existe un conflicto de concurrencia optimista pendiente. Debe revisar las diferencias y sincronizar la versión antes de guardar.',
      );
      return;
    }

    setValidationError('');
    setSuccessMessage('');
    setResolucionMensaje('');

    // Validación de versión esperada
    const numVersion = Number(versionEsperada);
    if (!Number.isInteger(numVersion) || numVersion < 1) {
      setValidationError('La versión esperada debe ser un número entero mayor o igual a 1.');
      return;
    }

    // Validación de EVA
    if (escalaDolorEVA !== '') {
      const numEva = Number(escalaDolorEVA);
      if (!Number.isInteger(numEva) || numEva < 0 || numEva > 10) {
        setValidationError('La escala EVA de dolor debe ser un número entero entre 0 y 10.');
        return;
      }
    }

    // Validación de piezas dentales en procedimientos
    for (let i = 0; i < procedimientos.length; i++) {
      const p = procedimientos[i];
      if (!p.descripcion || !p.descripcion.trim()) {
        setValidationError(`El procedimiento #${i + 1} requiere una descripción.`);
        return;
      }
      if (p.piezaDental !== null && p.piezaDental !== undefined && p.piezaDental !== '') {
        if (!esPiezaFDIValida(p.piezaDental)) {
          setValidationError(
            `El procedimiento #${i + 1} tiene una pieza dental FDI inválida (${p.piezaDental}). Debe ser una de las 52 piezas válidas (11-85).`,
          );
          return;
        }
      }
    }

    // Validación de diagnósticos
    for (let i = 0; i < diagnosticos.length; i++) {
      const d = diagnosticos[i];
      if (!d.descripcion || !d.descripcion.trim()) {
        setValidationError(`El diagnóstico #${i + 1} requiere una descripción.`);
        return;
      }
    }

    // Construcción del payload según ActualizarAtencionHttpDto
    const payload = {
      versionEsperada: numVersion,
      motivoConsulta: motivoConsulta.trim() || (consultaActual?.motivoConsulta || consulta.motivoConsulta),
      anamnesisActual: {
        descripcion: anamnesisDescripcion.trim(),
        tiempoEvolucion: tiempoEvolucion.trim() || null,
        escalaDolorEVA: escalaDolorEVA !== '' ? Number(escalaDolorEVA) : null,
      },
      exploracionFisica: {
        inspeccionExtraoral: inspeccionExtraoral.trim() || null,
        inspeccionIntraoral:
          inspeccionIntraoral.trim() ||
          consultaActual?.exploracionFisica?.inspeccionIntraoral ||
          consulta.exploracionFisica?.inspeccionIntraoral ||
          'Sin hallazgos adicionales registrados.',
        hallazgosDentales: hallazgosDentales.trim() || null,
      },
      diagnosticos: diagnosticos.map((d) => ({
        codigoCIE10: d.codigoCIE10 ? String(d.codigoCIE10).trim() : null,
        descripcion: d.descripcion.trim(),
        tipo: d.tipo || 'PRESUNTIVO',
      })),
      procedimientosRealizados: procedimientos.map((p) => ({
        codigo: p.codigo ? String(p.codigo).trim() : null,
        descripcion: p.descripcion.trim(),
        piezaDental:
          p.piezaDental !== null && p.piezaDental !== undefined && p.piezaDental !== ''
            ? Number(p.piezaDental)
            : null,
        observaciones: p.observaciones ? String(p.observaciones).trim() : null,
      })),
      evolucionSOAP: {
        subjetivo: soapSubjetivo.trim() || null,
        objetivo: soapObjetivo.trim() || null,
        analisis: soapAnalisis.trim() || null,
        plan: soapPlan.trim() || null,
      },
      recomendaciones: recomendaciones.trim() || null,
    };

    setIsSubmitting(true);
    try {
      const resultado = await onGuardar(payload);
      if (resultado) {
        setSuccessMessage(
          `¡Atención clínica guardada exitosamente! Consulta actualizada a versión v${resultado.version}.`,
        );
        setVersionEsperada(resultado.version);
        setConsultaActual(resultado);
        setConflictoCerrado(true);
        setConflictoServidorData(null);
        setMostrarComparador(false);
        setResolucionMensaje('');
        if (onActualizarConsulta) {
          onActualizarConsulta(resultado);
        }
        if (onResetError) {
          onResetError();
        }
      }
    } catch (err) {
      if (err?.status === 409) {
        setConflictoCerrado(false);
        void verificarEstadoServidor();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecargarServidorFresco = async () => {
    if (onRecargar) {
      onRecargar();
    }
    await verificarEstadoServidor();
  };

  const isLoading = isSubmitting || externalLoading || cargandoServidor;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Barra de cabecera con identificación y estado */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '24px' }}>🦷</span>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                Atención en Sillón: <code>{consultaActual?.id || consulta.id}</code>
              </h2>
              <EstadoConsultaBadge estado={estadoEfectivo} />
              <Badge variant="neutral">Versión Servidor: v{consultaActual?.version || consulta.version}</Badge>
              <Badge variant="primary">Versión Esperada: v{versionEsperada}</Badge>
              {bloqueadaPorOtraSesion && (
                <Badge variant="danger">Sellada en otra sesión</Badge>
              )}
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '13px' }}>
              Historia: <strong>{consulta.historiaClinicaId}</strong> | Paciente: <strong>{consulta.pacienteId}</strong> | Odontólogo: <strong>{consulta.odontologoId}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {onVolver && (
              <Button variant="secondary" onClick={onVolver} style={{ fontSize: '13px', padding: '6px 14px' }}>
                ← Ver Ficha Completa
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleRecargarServidorFresco}
              disabled={isLoading}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              🔄 Recargar Servidor
            </Button>
          </div>
        </div>

        {/* Advertencia si la consulta está cerrada/cancelada */}
        {isReadOnly && (
          <div style={{ marginTop: '16px' }}>
            <Alert
              title="Consulta Odontológica Sellada / Finalizada"
              detail={`Esta consulta se encuentra en estado ${estadoEfectivo}. Los datos clínicos están protegidos contra modificaciones y no se permite su alteración según la regla clínica INV-CONS-04.`}
              status={422}
            />
          </div>
        )}
      </Card>

      {/* ─── CASO A: Consulta Cerrada o Cancelada desde otra Sesión (INV-CONS-04) ─── */}
      {bloqueadaPorOtraSesion && (
        <Card style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>🚫</span>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: '0 0 6px', color: 'var(--danger)', fontSize: '16px', fontWeight: 700 }}>
                Edición Bloqueada: Consulta Finalizada en otra Sesión ({bloqueadaPorOtraSesion.estado})
              </h3>
              <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Esta consulta fue{' '}
                <strong>
                  {bloqueadaPorOtraSesion.estado === 'COMPLETADA' ? 'COMPLETADA y sellada' : 'CANCELADA'}
                </strong>{' '}
                simultáneamente desde otra sesión u operador (versión actual persistida: v{bloqueadaPorOtraSesion.version}).
              </p>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Conforme a la regla clínica de inmutabilidad <strong>INV-CONS-04</strong>, una consulta odontológica cerrada no permite ninguna modificación ni sobrescritura posterior. El formulario ha quedado en modo de solo lectura.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                {onVolver && (
                  <Button variant="secondary" onClick={onVolver}>
                    ← Volver a la Ficha Clínica
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── CASO B: Mensaje de Resolución Exitosa de Conflicto ─── */}
      {resolucionMensaje && !conflictoActivo && (
        <Alert
          title="Resolución de Concurrencia Aplicada"
          detail={resolucionMensaje}
          status={200}
          onClose={() => setResolucionMensaje('')}
        />
      )}

      {/* ─── CASO C: Alerta de Conflicto Optimista HTTP 409 Activo ─── */}
      {conflictoActivo && !bloqueadaPorOtraSesion && (
        <Card style={{ borderColor: 'var(--warning)', background: 'var(--warning-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <h3 style={{ margin: 0, color: 'var(--warning)', fontSize: '16px', fontWeight: 700 }}>
                  Conflicto de Concurrencia Optimista Detectado (HTTP 409)
                </h3>
                <Badge variant="warning">Borrador local protegido</Badge>
              </div>

              <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-primary)' }}>
                Otro operador o proceso actualizó la consulta en el servidor mientras usted preparaba cambios (Versión esperada enviada: <strong>v{versionEsperada}</strong>
                {conflictoServidorData ? ` | Versión persistida en servidor: v${conflictoServidorData.version}` : ''}).
              </p>
              <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong>Su borrador local se ha conservado íntegro sin sobrescrituras forzadas.</strong> Para resolver este conflicto de forma segura, revise las diferencias con la versión del servidor y decida qué datos conservar antes de enviar una nueva actualización.
              </p>

              {cargandoServidor && (
                <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--primary-dark)' }}>
                  ⏳ Obteniendo versión actualizada desde el servidor para comparación...
                </p>
              )}

              {errorCargaServidor && (
                <div style={{ marginBottom: '12px' }}>
                  <Alert
                    title="Error al consultar servidor"
                    detail={errorCargaServidor}
                    status={500}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    if (!conflictoServidorData) {
                      void verificarEstadoServidor();
                    } else {
                      setMostrarComparador((prev) => !prev);
                    }
                  }}
                  disabled={cargandoServidor}
                >
                  🔍 {mostrarComparador ? 'Ocultar Comparador de Cambios' : 'Comparar Cambios con Versión del Servidor'}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setMostrarConfirmacionDescarte(true)}
                  disabled={cargandoServidor}
                >
                  🔄 Descartar Mi Borrador y Cargar Versión del Servidor
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void verificarEstadoServidor()}
                  disabled={cargandoServidor}
                >
                  📡 Re-consultar Servidor
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Confirmación para Descartar Borrador Local ─── */}
      {mostrarConfirmacionDescarte && (
        <Card style={{ borderColor: 'var(--danger)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ margin: 0, color: 'var(--danger)', fontSize: '15px', fontWeight: 700 }}>
              ⚠️ ¿Confirmar descarte del borrador local?
            </h4>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
              Esta acción reemplazará todos los campos que ha editado (anamnesis, exploración, diagnósticos, procedimientos y notas SOAP) por los datos que actualmente residen en el servidor (v{conflictoServidorData?.version || 'actual'}). Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <Button
                type="button"
                variant="danger"
                onClick={handleDescartarBorradorYAdoptarServidor}
              >
                Sí, descartar mi borrador y adoptar datos del servidor
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMostrarConfirmacionDescarte(false)}
              >
                Cancelar y conservar mi borrador
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ─── CASO D: Panel de Comparación y Resolución Asistida de Conflictos ─── */}
      {mostrarComparador && conflictoServidorData && !bloqueadaPorOtraSesion && (
        <Card title={`Resolución Asistida de Concurrencia: Servidor (v${conflictoServidorData.version}) vs Borrador Local (v${versionEsperada})`}>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Compare a continuación las diferencias detectadas entre lo persistido en el servidor por otro operador y su borrador local en sillón. Puede adoptar selectivamente campos del servidor o mantener sus datos antes de sincronizar la versión esperada.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
            {/* 1. Motivo de Consulta */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', background: difMotivo ? 'var(--warning-bg)' : 'var(--neutral-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Motivo de Consulta</span>
                {difMotivo ? (
                  <Badge variant="warning">Diferencia Detectada</Badge>
                ) : (
                  <Badge variant="neutral">Sin diferencias</Badge>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>🌐 En Servidor:</div>
                  <div>{conflictoServidorData.motivoConsulta || '—'}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--primary-dark)', marginBottom: '4px' }}>✏️ Su Borrador Local:</div>
                  <div>{motivoConsulta || '—'}</div>
                </div>
              </div>
              {difMotivo && (
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" onClick={handleAdoptarMotivoServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                    ⬅️ Usar motivo del servidor en mi borrador
                  </Button>
                </div>
              )}
            </div>

            {/* 2. Anamnesis Actual y Escala EVA */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', background: difAnamnesis ? 'var(--warning-bg)' : 'var(--neutral-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>1. Anamnesis Actual y Escala de Dolor EVA</span>
                {difAnamnesis ? (
                  <Badge variant="warning">Diferencia Detectada</Badge>
                ) : (
                  <Badge variant="neutral">Sin diferencias</Badge>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>🌐 En Servidor:</div>
                  <div><strong>Relato:</strong> {conflictoServidorData.anamnesisActual?.descripcion || '—'}</div>
                  <div><strong>Evolución:</strong> {conflictoServidorData.anamnesisActual?.tiempoEvolucion || '—'}</div>
                  <div><strong>EVA:</strong> {conflictoServidorData.anamnesisActual?.escalaDolorEVA != null ? `${conflictoServidorData.anamnesisActual.escalaDolorEVA}/10` : 'No registrado'}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--primary-dark)', marginBottom: '4px' }}>✏️ Su Borrador Local:</div>
                  <div><strong>Relato:</strong> {anamnesisDescripcion || '—'}</div>
                  <div><strong>Evolución:</strong> {tiempoEvolucion || '—'}</div>
                  <div><strong>EVA:</strong> {escalaDolorEVA !== '' ? `${escalaDolorEVA}/10` : 'No registrado'}</div>
                </div>
              </div>
              {difAnamnesis && (
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" onClick={handleAdoptarAnamnesisServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                    ⬅️ Usar anamnesis del servidor en mi borrador
                  </Button>
                </div>
              )}
            </div>

            {/* 3. Exploración Física */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', background: difExploracion ? 'var(--warning-bg)' : 'var(--neutral-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>2. Exploración Física</span>
                {difExploracion ? (
                  <Badge variant="warning">Diferencia Detectada</Badge>
                ) : (
                  <Badge variant="neutral">Sin diferencias</Badge>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>🌐 En Servidor:</div>
                  <div><strong>Intraoral:</strong> {conflictoServidorData.exploracionFisica?.inspeccionIntraoral || '—'}</div>
                  <div><strong>Extraoral:</strong> {conflictoServidorData.exploracionFisica?.inspeccionExtraoral || '—'}</div>
                  <div><strong>Hallazgos:</strong> {conflictoServidorData.exploracionFisica?.hallazgosDentales || '—'}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--primary-dark)', marginBottom: '4px' }}>✏️ Su Borrador Local:</div>
                  <div><strong>Intraoral:</strong> {inspeccionIntraoral || '—'}</div>
                  <div><strong>Extraoral:</strong> {inspeccionExtraoral || '—'}</div>
                  <div><strong>Hallazgos:</strong> {hallazgosDentales || '—'}</div>
                </div>
              </div>
              {difExploracion && (
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" onClick={handleAdoptarExploracionServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                    ⬅️ Usar exploración del servidor en mi borrador
                  </Button>
                </div>
              )}
            </div>

            {/* 4. Diagnósticos */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', background: 'var(--neutral-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>3. Diagnósticos Clínicos</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Servidor: {conflictoServidorData.diagnosticos?.length || 0} | Borrador: {diagnosticos.length}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>🌐 En Servidor:</div>
                  {(conflictoServidorData.diagnosticos || []).length === 0 ? (
                    <em style={{ color: 'var(--text-muted)' }}>Ninguno registrado</em>
                  ) : (
                    (conflictoServidorData.diagnosticos || []).map((d, i) => (
                      <div key={`srv-d-${i}`} style={{ marginBottom: '4px' }}>
                        • {d.codigoCIE10 ? `[${d.codigoCIE10}] ` : ''}{d.descripcion} ({d.tipo})
                      </div>
                    ))
                  )}
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--primary-dark)', marginBottom: '4px' }}>✏️ Su Borrador Local:</div>
                  {diagnosticos.length === 0 ? (
                    <em style={{ color: 'var(--text-muted)' }}>Ninguno en borrador</em>
                  ) : (
                    diagnosticos.map((d, i) => (
                      <div key={`loc-d-${i}`} style={{ marginBottom: '4px' }}>
                        • {d.codigoCIE10 ? `[${d.codigoCIE10}] ` : ''}{d.descripcion} ({d.tipo})
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={handleAdoptarDiagnosticosServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                  ⬅️ Reemplazar lista con diagnósticos del servidor
                </Button>
              </div>
            </div>

            {/* 5. Procedimientos Realizados */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', background: 'var(--neutral-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>4. Procedimientos en Sillón (FDI)</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Servidor: {conflictoServidorData.procedimientosRealizados?.length || 0} | Borrador: {procedimientos.length}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>🌐 En Servidor:</div>
                  {(conflictoServidorData.procedimientosRealizados || []).length === 0 ? (
                    <em style={{ color: 'var(--text-muted)' }}>Ninguno registrado</em>
                  ) : (
                    (conflictoServidorData.procedimientosRealizados || []).map((p, i) => (
                      <div key={`srv-p-${i}`} style={{ marginBottom: '4px' }}>
                        • {p.codigo ? `[${p.codigo}] ` : ''}{p.descripcion} {p.piezaDental ? `(Pieza FDI: ${p.piezaDental})` : ''}
                      </div>
                    ))
                  )}
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--primary-dark)', marginBottom: '4px' }}>✏️ Su Borrador Local:</div>
                  {procedimientos.length === 0 ? (
                    <em style={{ color: 'var(--text-muted)' }}>Ninguno en borrador</em>
                  ) : (
                    procedimientos.map((p, i) => (
                      <div key={`loc-p-${i}`} style={{ marginBottom: '4px' }}>
                        • {p.codigo ? `[${p.codigo}] ` : ''}{p.descripcion} {p.piezaDental ? `(Pieza FDI: ${p.piezaDental})` : ''}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={handleAdoptarProcedimientosServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                  ⬅️ Reemplazar lista con procedimientos del servidor
                </Button>
              </div>
            </div>

            {/* 6. SOAP */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', background: difSOAP ? 'var(--warning-bg)' : 'var(--neutral-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>5. Evolución SOAP</span>
                {difSOAP ? (
                  <Badge variant="warning">Diferencia Detectada</Badge>
                ) : (
                  <Badge variant="neutral">Sin diferencias</Badge>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>🌐 En Servidor:</div>
                  <div><strong>[S]:</strong> {conflictoServidorData.evolucionSOAP?.subjetivo || '—'}</div>
                  <div><strong>[O]:</strong> {conflictoServidorData.evolucionSOAP?.objetivo || '—'}</div>
                  <div><strong>[A]:</strong> {conflictoServidorData.evolucionSOAP?.analisis || '—'}</div>
                  <div><strong>[P]:</strong> {conflictoServidorData.evolucionSOAP?.plan || '—'}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--primary-dark)', marginBottom: '4px' }}>✏️ Su Borrador Local:</div>
                  <div><strong>[S]:</strong> {soapSubjetivo || '—'}</div>
                  <div><strong>[O]:</strong> {soapObjetivo || '—'}</div>
                  <div><strong>[A]:</strong> {soapAnalisis || '—'}</div>
                  <div><strong>[P]:</strong> {soapPlan || '—'}</div>
                </div>
              </div>
              {difSOAP && (
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" onClick={handleAdoptarSOAPServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                    ⬅️ Usar notas SOAP del servidor en mi borrador
                  </Button>
                </div>
              )}
            </div>

            {/* 7. Recomendaciones */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', background: difRecomendaciones ? 'var(--warning-bg)' : 'var(--neutral-50)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>6. Recomendaciones Terapéuticas</span>
                {difRecomendaciones ? (
                  <Badge variant="warning">Diferencia Detectada</Badge>
                ) : (
                  <Badge variant="neutral">Sin diferencias</Badge>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>🌐 En Servidor:</div>
                  <div>{conflictoServidorData.recomendaciones || '—'}</div>
                </div>
                <div style={{ background: 'var(--bg-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--primary-dark)', marginBottom: '4px' }}>✏️ Su Borrador Local:</div>
                  <div>{recomendaciones || '—'}</div>
                </div>
              </div>
              {difRecomendaciones && (
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="button" variant="secondary" onClick={handleAdoptarRecomendacionesServidor} style={{ fontSize: '12px', padding: '4px 10px' }}>
                    ⬅️ Usar recomendaciones del servidor en mi borrador
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Acciones de resolución del comparador */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: 'var(--neutral-100)', padding: '14px 16px', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Al aceptar la resolución, su borrador se preservará con las elecciones tomadas y la versión esperada se actualizará a <strong>v{conflictoServidorData.version}</strong>.
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Button type="button" variant="secondary" onClick={handleCerrarComparador}>
                ✕ Cerrar Comparador
              </Button>
              <Button type="button" variant="primary" onClick={handleAceptarResolucion}>
                🛡️ Aplicar Resolución y Sincronizar Versión Esperada (v{conflictoServidorData.version})
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Mensaje de Validación Local */}
      {validationError && (
        <Alert
          title="Validación de datos clínicos"
          detail={validationError}
          status={400}
          onClose={() => setValidationError('')}
        />
      )}

      {/* Mensaje de Éxito tras Guardar */}
      {successMessage && (
        <div style={{ padding: '14px 18px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-md)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>✅</span>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage('')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--success)', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Errores externos RFC 7807 (distintos a 409) */}
      {externalError && externalError.status !== 409 && (
        <Alert
          title={externalError.title}
          detail={externalError.detail}
          status={externalError.status}
          invalidParams={externalError.invalidParams}
        />
      )}

      {/* Formulario Principal */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Barra de Filtro / Pestañas de Secciones */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'todas', label: '📖 Todas las Secciones' },
            { id: 'anamnesis', label: '1. Anamnesis & EVA' },
            { id: 'exploracion', label: '2. Exploración Física' },
            { id: 'diagnosticos', label: `3. Diagnósticos (${diagnosticos.length})` },
            { id: 'procedimientos', label: `4. Procedimientos (${procedimientos.length})` },
            { id: 'soap', label: '5. Evolución SOAP' },
            { id: 'recomendaciones', label: '6. Indicaciones' },
          ].map((sec) => (
            <button
              key={sec.id}
              type="button"
              className={`nav-tab-btn ${activeSection === sec.id ? 'active' : ''}`}
              onClick={() => setActiveSection(sec.id)}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* ─── Sección 0: Motivo de Consulta ───────────────────────────────── */}
        {(activeSection === 'todas' || activeSection === 'anamnesis') && (
          <Card title="Motivo Principal de Consulta (Ajuste o Confirmación)">
            <label htmlFor="motivoConsultaInput" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Motivo manifestado o actualizado:
            </label>
            <Input
              id="motivoConsultaInput"
              value={motivoConsulta}
              onChange={(e) => setMotivoConsulta(e.target.value)}
              placeholder="Describa el motivo o síntoma principal por el cual consulta el paciente..."
              disabled={isReadOnly || isLoading}
            />
          </Card>
        )}

        {/* ─── Sección 1: Anamnesis Actual & Escala EVA ─────────────────────── */}
        {(activeSection === 'todas' || activeSection === 'anamnesis') && (
          <Card title="1. Anamnesis Actual y Escala de Dolor (EVA)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label htmlFor="anamnesisDesc" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Relato cronológico de la dolencia actual:
                </label>
                <textarea
                  id="anamnesisDesc"
                  className="search-input"
                  style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
                  value={anamnesisDescripcion}
                  onChange={(e) => setAnamnesisDescripcion(e.target.value)}
                  placeholder="Relato cronológico de síntomas, localización, factores agravantes o atenuantes..."
                  disabled={isReadOnly || isLoading}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div>
                  <label htmlFor="tiempoEvolucionInput" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Tiempo de evolución:
                  </label>
                  <Input
                    id="tiempoEvolucionInput"
                    value={tiempoEvolucion}
                    onChange={(e) => setTiempoEvolucion(e.target.value)}
                    placeholder="ej. 3 días, 48 horas, 2 semanas..."
                    disabled={isReadOnly || isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="escalaEvaSelect" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Escala Visual Analógica de Dolor (EVA: 0 a 10):
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <select
                      id="escalaEvaSelect"
                      className="dev-select"
                      style={{ padding: '8px 12px', minWidth: '140px', fontSize: '14px' }}
                      value={escalaDolorEVA}
                      onChange={(e) => setEscalaDolorEVA(e.target.value)}
                      disabled={isReadOnly || isLoading}
                    >
                      <option value="">No evaluado / Sin registro</option>
                      <option value="0">0 - Sin dolor (Asintomático)</option>
                      <option value="1">1 - Dolor muy leve</option>
                      <option value="2">2 - Dolor leve</option>
                      <option value="3">3 - Dolor tolerable</option>
                      <option value="4">4 - Dolor moderado</option>
                      <option value="5">5 - Dolor moderado intenso</option>
                      <option value="6">6 - Dolor persistente</option>
                      <option value="7">7 - Dolor severo / agudo</option>
                      <option value="8">8 - Dolor muy intenso</option>
                      <option value="9">9 - Dolor insoportable</option>
                      <option value="10">10 - Dolor máximo imaginable</option>
                    </select>

                    {escalaDolorEVA !== '' && (
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor:
                            Number(escalaDolorEVA) === 0
                              ? 'var(--success-bg)'
                              : Number(escalaDolorEVA) <= 3
                                ? 'var(--primary-light)'
                                : Number(escalaDolorEVA) <= 6
                                  ? 'var(--warning-bg)'
                                  : 'var(--danger-bg)',
                          color:
                            Number(escalaDolorEVA) === 0
                              ? 'var(--success)'
                              : Number(escalaDolorEVA) <= 3
                                ? 'var(--primary-dark)'
                                : Number(escalaDolorEVA) <= 6
                                  ? 'var(--warning)'
                                  : 'var(--danger)',
                        }}
                      >
                        Nivel {escalaDolorEVA}/10
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ─── Sección 2: Exploración Física ───────────────────────────────── */}
        {(activeSection === 'todas' || activeSection === 'exploracion') && (
          <Card title="2. Exploración Física (Extraoral, Intraoral y Hallazgos Dentales)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label htmlFor="inspeccionIntraoralArea" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Inspección Intraoral (Requerido para sellado formal de consulta):
                </label>
                <textarea
                  id="inspeccionIntraoralArea"
                  className="search-input"
                  style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
                  value={inspeccionIntraoral}
                  onChange={(e) => setInspeccionIntraoral(e.target.value)}
                  placeholder="Examen de tejidos blandos, mucosas, encías, lengua, paladar, piso de boca..."
                  disabled={isReadOnly || isLoading}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label htmlFor="inspeccionExtraoralArea" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Inspección Extraoral (Facial, ATM, Ganglios):
                  </label>
                  <textarea
                    id="inspeccionExtraoralArea"
                    className="search-input"
                    style={{ width: '100%', minHeight: '70px', boxSizing: 'border-box' }}
                    value={inspeccionExtraoral}
                    onChange={(e) => setInspeccionExtraoral(e.target.value)}
                    placeholder="Asimetrías faciales, adenopatías, palpación de ATM y cadenas ganglionares..."
                    disabled={isReadOnly || isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="hallazgosDentalesArea" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Hallazgos Dentales Específicos:
                  </label>
                  <textarea
                    id="hallazgosDentalesArea"
                    className="search-input"
                    style={{ width: '100%', minHeight: '70px', boxSizing: 'border-box' }}
                    value={hallazgosDentales}
                    onChange={(e) => setHallazgosDentales(e.target.value)}
                    placeholder="Lesiones cariosas visibles, fracturas, restauraciones desadaptadas, oclusión..."
                    disabled={isReadOnly || isLoading}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ─── Sección 3: Diagnósticos ─────────────────────────────────────── */}
        {(activeSection === 'todas' || activeSection === 'diagnosticos') && (
          <Card title="3. Diagnósticos Clínicos (CIE-10 / Tipo de Certeza)">
            {/* Lista actual de diagnósticos */}
            {diagnosticos.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', margin: '0 0 16px' }}>
                No hay diagnósticos añadidos en el borrador de atención.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {diagnosticos.map((diag, idx) => (
                  <div
                    key={`diag-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--neutral-50)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 14px',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-muted)' }}>
                        #{idx + 1}
                      </span>
                      {diag.codigoCIE10 && (
                        <code style={{ background: 'var(--neutral-200)', padding: '2px 6px', fontWeight: 700 }}>
                          {diag.codigoCIE10}
                        </code>
                      )}
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{diag.descripcion}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <select
                        className="dev-select"
                        value={diag.tipo}
                        onChange={(e) => handleCambiarDiagnostico(idx, 'tipo', e.target.value)}
                        disabled={isReadOnly || isLoading}
                        style={{ fontSize: '12px' }}
                      >
                        <option value="PRESUNTIVO">PRESUNTIVO</option>
                        <option value="DEFINITIVO">DEFINITIVO</option>
                      </select>

                      <Badge variant={diag.tipo === 'DEFINITIVO' ? 'success' : 'neutral'}>
                        {diag.tipo}
                      </Badge>

                      {!isReadOnly && (
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => handleEliminarDiagnostico(idx)}
                          disabled={isLoading}
                          style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--danger)' }}
                        >
                          ✕ Quitar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario para agregar diagnóstico */}
            {!isReadOnly && (
              <div
                style={{
                  background: 'var(--neutral-50)',
                  border: '1px dashed var(--primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--primary-dark)' }}>
                  ➕ Agregar Nuevo Diagnóstico al Borrador:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 140px auto', gap: '10px', alignItems: 'center' }}>
                  <Input
                    placeholder="CIE-10 (ej. K04.0)"
                    value={nuevoDiagCodigo}
                    onChange={(e) => setNuevoDiagCodigo(e.target.value)}
                    disabled={isLoading}
                    aria-label="Código CIE-10 del diagnóstico"
                  />
                  <Input
                    placeholder="Descripción clínica del diagnóstico..."
                    value={nuevoDiagDesc}
                    onChange={(e) => setNuevoDiagDesc(e.target.value)}
                    disabled={isLoading}
                    aria-label="Descripción del diagnóstico"
                  />
                  <select
                    className="dev-select"
                    value={nuevoDiagTipo}
                    onChange={(e) => setNuevoDiagTipo(e.target.value)}
                    disabled={isLoading}
                    style={{ height: '38px', fontSize: '13px' }}
                    aria-label="Tipo de diagnóstico"
                  >
                    <option value="PRESUNTIVO">PRESUNTIVO</option>
                    <option value="DEFINITIVO">DEFINITIVO</option>
                  </select>
                  <Button type="button" onClick={handleAgregarDiagnostico} disabled={isLoading || !nuevoDiagDesc.trim()}>
                    + Añadir
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ─── Sección 4: Procedimientos Realizados en Sillón ─────────────── */}
        {(activeSection === 'todas' || activeSection === 'procedimientos') && (
          <Card title="4. Procedimientos Realizados en Sillón Dental (FDI / Nomenclatura)">
            {/* Lista actual de procedimientos */}
            {procedimientos.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', margin: '0 0 16px' }}>
                No hay procedimientos registrados en el borrador de atención.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {procedimientos.map((proc, idx) => (
                  <div
                    key={`proc-${idx}`}
                    style={{
                      background: 'var(--neutral-50)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-muted)' }}>
                          #{idx + 1}
                        </span>
                        {proc.codigo && (
                          <code style={{ background: 'var(--neutral-200)', padding: '2px 6px', fontWeight: 700 }}>
                            {proc.codigo}
                          </code>
                        )}
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{proc.descripcion}</span>
                        {proc.piezaDental && (
                          <span
                            style={{
                              background: 'var(--primary-light)',
                              color: 'var(--primary-dark)',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            🦷 {obtenerDescripcionPiezaFDI(proc.piezaDental)}
                          </span>
                        )}
                      </div>

                      {!isReadOnly && (
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => handleEliminarProcedimiento(idx)}
                          disabled={isLoading}
                          style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--danger)' }}
                        >
                          ✕ Quitar
                        </Button>
                      )}
                    </div>

                    {proc.observaciones && (
                      <p style={{ margin: '6px 0 0 24px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        💬 <em>{proc.observaciones}</em>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Formulario para agregar procedimiento */}
            {!isReadOnly && (
              <div
                style={{
                  background: 'var(--neutral-50)',
                  border: '1px dashed var(--primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px', color: 'var(--primary-dark)' }}>
                  ➕ Agregar Procedimiento al Borrador:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '10px' }}>
                  <Input
                    placeholder="Código (ej. PROC-OBT-01)"
                    value={nuevoProcCodigo}
                    onChange={(e) => setNuevoProcCodigo(e.target.value)}
                    disabled={isLoading}
                    aria-label="Código del procedimiento"
                  />
                  <Input
                    placeholder="Descripción de la intervención dental realizada..."
                    value={nuevoProcDesc}
                    onChange={(e) => setNuevoProcDesc(e.target.value)}
                    disabled={isLoading}
                    aria-label="Descripción del procedimiento"
                  />
                  <select
                    className="dev-select"
                    value={nuevoProcPieza}
                    onChange={(e) => setNuevoProcPieza(e.target.value)}
                    disabled={isLoading}
                    style={{ height: '38px', fontSize: '13px' }}
                    aria-label="Pieza dental FDI"
                  >
                    <option value="">Sin pieza específica / General</option>
                    <optgroup label="Dentición Permanente (Adultos)">
                      {LISTADO_PIEZAS_FDI.filter((p) => p.esPermanente).map((p) => (
                        <option key={p.valor} value={p.valor}>
                          Pieza {p.valor} - {p.descripcion}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Dentición Decidua / Temporal (Niños)">
                      {LISTADO_PIEZAS_FDI.filter((p) => !p.esPermanente).map((p) => (
                        <option key={p.valor} value={p.valor}>
                          Pieza {p.valor} - {p.descripcion}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <Input
                    placeholder="Observaciones técnicas (aislamiento, resina utilizada, conductometría...)"
                    value={nuevoProcObs}
                    onChange={(e) => setNuevoProcObs(e.target.value)}
                    disabled={isLoading}
                    aria-label="Observaciones del procedimiento"
                  />
                  <Button type="button" onClick={handleAgregarProcedimiento} disabled={isLoading || !nuevoProcDesc.trim()}>
                    + Añadir
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ─── Sección 5: Evolución SOAP ───────────────────────────────────── */}
        {(activeSection === 'todas' || activeSection === 'soap') && (
          <Card title="5. Evolución Clínica Estructurada SOAP">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                <label htmlFor="soapSubjetivoArea" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--primary-dark)', marginBottom: '4px' }}>
                  [S] SUBJETIVO (Relato del paciente, evolución de dolor):
                </label>
                <textarea
                  id="soapSubjetivoArea"
                  className="search-input"
                  style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
                  value={soapSubjetivo}
                  onChange={(e) => setSoapSubjetivo(e.target.value)}
                  placeholder="Síntomas que el paciente refiere desde la última atención..."
                  disabled={isReadOnly || isLoading}
                />
              </div>

              <div>
                <label htmlFor="soapObjetivoArea" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--primary-dark)', marginBottom: '4px' }}>
                  [O] OBJETIVO (Hallazgos exploratorios, pruebas pulpares, radiografía):
                </label>
                <textarea
                  id="soapObjetivoArea"
                  className="search-input"
                  style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
                  value={soapObjetivo}
                  onChange={(e) => setSoapObjetivo(e.target.value)}
                  placeholder="Signos clínicos, sondeo, percusión, vitalidad pulpar..."
                  disabled={isReadOnly || isLoading}
                />
              </div>

              <div>
                <label htmlFor="soapAnalisisArea" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--primary-dark)', marginBottom: '4px' }}>
                  [A] ANÁLISIS (Juicio clínico, respuesta al tratamiento):
                </label>
                <textarea
                  id="soapAnalisisArea"
                  className="search-input"
                  style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
                  value={soapAnalisis}
                  onChange={(e) => setSoapAnalisis(e.target.value)}
                  placeholder="Interpretación del estado clínico y pronóstico..."
                  disabled={isReadOnly || isLoading}
                />
              </div>

              <div>
                <label htmlFor="soapPlanArea" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--primary-dark)', marginBottom: '4px' }}>
                  [P] PLAN DE TRATAMIENTO (Próxima cita, interconsultas, fases):
                </label>
                <textarea
                  id="soapPlanArea"
                  className="search-input"
                  style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
                  value={soapPlan}
                  onChange={(e) => setSoapPlan(e.target.value)}
                  placeholder="Pasos terapéuticos siguientes, citas de control..."
                  disabled={isReadOnly || isLoading}
                />
              </div>
            </div>
          </Card>
        )}

        {/* ─── Sección 6: Recomendaciones ─────────────────────────────────── */}
        {(activeSection === 'todas' || activeSection === 'recomendaciones') && (
          <Card title="6. Recomendaciones e Indicaciones Terapéuticas al Paciente">
            <label htmlFor="recomendacionesArea" style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
              Instrucciones post-atención (cuidados, higiene, pautas de alarma):
            </label>
            <textarea
              id="recomendacionesArea"
              className="search-input"
              style={{ width: '100%', minHeight: '70px', boxSizing: 'border-box' }}
              value={recomendaciones}
              onChange={(e) => setRecomendaciones(e.target.value)}
              placeholder="Indicaciones higiénicas, dieta blanda, control de inflamación, recomendaciones farmacológicas..."
              disabled={isReadOnly || isLoading}
            />
          </Card>
        )}

        {/* Barra de Acciones Final */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            boxShadow: 'var(--shadow-sm)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>Versión esperada para concurrencia:</span>
            <code style={{ fontWeight: 700, background: 'var(--neutral-100)', padding: '2px 6px' }}>
              v{versionEsperada}
            </code>
            {isReadOnly && (
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                • Edición bloqueada ({bloqueadaPorOtraSesion ? `Sellada en otra sesión: ${bloqueadaPorOtraSesion.estado}` : 'Consulta sellada'})
              </span>
            )}
            {conflictoActivo && !isReadOnly && (
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>
                • Conflicto HTTP 409 activo (sincronice versión antes de guardar)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {onVolver && (
              <Button type="button" variant="secondary" onClick={onVolver} disabled={isLoading}>
                Cancelar / Volver
              </Button>
            )}

            {!isReadOnly && (
              <Button
                type="submit"
                loading={isLoading}
                disabled={isLoading || isReadOnly || conflictoActivo}
                title={conflictoActivo ? 'Resuelva el conflicto de concurrencia optimista antes de guardar' : undefined}
              >
                {isLoading ? 'Guardando en Sillón...' : '💾 Guardar Atención Clínica'}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
