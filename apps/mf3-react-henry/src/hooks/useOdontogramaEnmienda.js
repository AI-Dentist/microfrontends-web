import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  calcularDeltasOdontograma,
  resumirCambiosBorrador,
  validarInvariantesBorrador,
} from '../utils/odontograma-deltas.js';
import {
  construirPayloadRevision,
  validarMetadatosRevision,
} from '../utils/odontograma-payloads.js';
import {
  ESTADO_ANATOMICO,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_REVISION_ODONTOGRAMA,
} from '../constants/odontograma.constants.js';

const SUPERFICIES_ESTANDAR = Object.freeze([
  TIPO_SUPERFICIE.VESTIBULAR,
  TIPO_SUPERFICIE.PALATINA_LINGUAL,
  TIPO_SUPERFICIE.MESIAL,
  TIPO_SUPERFICIE.DISTAL,
  TIPO_SUPERFICIE.OCLUSAL_INCISAL,
]);

function obtenerFechaActualLocal() {
  const ahora = new Date();
  ahora.setMinutes(ahora.getMinutes() - ahora.getTimezoneOffset());
  return ahora.toISOString().slice(0, 16);
}

/**
 * Hook para la gestión del borrador y ciclo de vida de ENMIENDAS CORRECTIVAS
 * sobre revisiones históricas del Odontograma (Iteración 7F-4B).
 *
 * Principios clínicos y de auditoría:
 * - Base de comparación de deltas: estrictamente `revisionCorregida.snapshotPiezas`.
 * - Control de concurrencia optimista: `versionEsperada` proviene del agregado consolidado actual.
 * - Modo retrospectivo puro: `aplicaAlEstadoActual = false` (no modifica el presente vigente).
 * - Borrador 100% en memoria de sesión (sin persistencia en localStorage ni sessionStorage).
 * - Aislamiento total: no contamina ni sobrescribe el borrador de NUEVA_OBSERVACION.
 * - Cancelación y limpieza automática ante cambio de expediente o cambio de revisión corregida.
 *
 * @param {object|null} odontogramaActual - OdontogramaActualDto maestro consolidado
 * @param {string} historiaClinicaId - Identificador de la historia clínica activa
 */
export function useOdontogramaEnmienda(odontogramaActual, historiaClinicaId = '') {
  const [modoEnmienda, setModoEnmienda] = useState(false);
  const [revisionCorregida, setRevisionCorregida] = useState(null);
  const [borradorModificaciones, setBorradorModificaciones] = useState({});
  const [motivoRevision, setMotivoRevision] = useState('');
  const [fechaObservacion, setFechaObservacion] = useState(obtenerFechaActualLocal);
  const [consultaId, setConsultaId] = useState('');
  const [versionEsperadaOriginal, setVersionEsperadaOriginal] = useState(null);
  const [errorValidacion, setErrorValidacion] = useState(null);
  const [conflictoRevisadoConsciente, setConflictoRevisadoConsciente] = useState(false);

  const prevHistoriaIdRef = useRef(historiaClinicaId);
  const prevOdontogramaIdRef = useRef(odontogramaActual?.id);

  // Mapear snapshotPiezas de la revisión corregida para acceso O(1)
  const piezasHistoricasMap = useMemo(() => {
    if (!revisionCorregida?.snapshotPiezas || !Array.isArray(revisionCorregida.snapshotPiezas)) {
      return {};
    }
    const map = {};
    for (const p of revisionCorregida.snapshotPiezas) {
      if (p && p.numeroFDI) {
        map[p.numeroFDI] = p;
      }
    }
    return map;
  }, [revisionCorregida]);

  // Si cambia la historia clínica o el odontograma ID, descartar inmediatamente
  useEffect(() => {
    if (
      prevHistoriaIdRef.current !== historiaClinicaId ||
      prevOdontogramaIdRef.current !== odontogramaActual?.id
    ) {
      setModoEnmienda(false);
      setRevisionCorregida(null);
      setBorradorModificaciones({});
      setMotivoRevision('');
      setErrorValidacion(null);
      setVersionEsperadaOriginal(null);
      prevHistoriaIdRef.current = historiaClinicaId;
      prevOdontogramaIdRef.current = odontogramaActual?.id;
    }
  }, [historiaClinicaId, odontogramaActual?.id]);

  // Detección de cambio concurrente de versión en el agregado actual mientras se preparaba la enmienda
  // Política de concurrencia optimista: no auto-alinear; versionEsperadaOriginal permanece inmutable
  const versionActualCambio = Boolean(
    modoEnmienda &&
      versionEsperadaOriginal !== null &&
      (odontogramaActual?.version || 1) !== versionEsperadaOriginal,
  );

  /**
   * Inicia formalmente la preparación de una enmienda correctiva sobre una revisión histórica.
   * Captura y congela la versión actual del maestro como versionEsperadaOriginal inmutable.
   *
   * @param {object} revision - RevisionOdontogramaDto con id y snapshotPiezas completos (52 piezas)
   * @returns {boolean} true si se inició correctamente, false si falló la validación
   */
  const iniciarEnmienda = useCallback(
    (revision) => {
      if (!odontogramaActual?.id) {
        setErrorValidacion('No existe un odontograma consolidado activo en el expediente.');
        return false;
      }

      if (!revision || !revision.id) {
        setErrorValidacion('Debe seleccionar una revisión histórica con ID válido.');
        return false;
      }

      if (!Array.isArray(revision.snapshotPiezas) || revision.snapshotPiezas.length !== 52) {
        setErrorValidacion(
          `La revisión seleccionada no contiene el snapshot basal completo de 52 posiciones FDI (recibido: ${revision?.snapshotPiezas?.length ?? 0}). No se puede iniciar la enmienda.`,
        );
        return false;
      }

      // Comprobar pertenencia al odontograma si viene especificado
      if (revision.odontogramaId && revision.odontogramaId !== odontogramaActual.id) {
        setErrorValidacion('La revisión histórica seleccionada no pertenece al odontograma actual.');
        return false;
      }

      setRevisionCorregida(revision);
      setBorradorModificaciones({});
      setMotivoRevision('');
      setFechaObservacion(
        revision.fechaObservacionClinica
          ? new Date(revision.fechaObservacionClinica).toISOString().slice(0, 16)
          : obtenerFechaActualLocal(),
      );
      setConsultaId(revision.consultaId || '');
      setErrorValidacion(null);
      setModoEnmienda(true);
      // Invariante de concurrencia optimista: versionEsperadaOriginal inmutable mientras exista el borrador
      setVersionEsperadaOriginal(odontogramaActual.version);
      return true;
    },
    [odontogramaActual],
  );

  /**
   * Sale del modo de enmienda y descarta los cambios en memoria.
   */
  const salirModoEnmienda = useCallback(() => {
    setModoEnmienda(false);
    setRevisionCorregida(null);
    setBorradorModificaciones({});
    setMotivoRevision('');
    setErrorValidacion(null);
    setVersionEsperadaOriginal(null);
  }, []);

  /**
   * Obtiene la copia de trabajo borrador de una pieza, combinando el snapshot histórico con sus modificaciones locales.
   */
  const obtenerPiezaBorrador = useCallback(
    (numeroFDI) => {
      const originalHistorico = piezasHistoricasMap[numeroFDI];
      if (!originalHistorico) return null;

      const mod = borradorModificaciones[numeroFDI];
      if (mod) {
        return {
          ...originalHistorico,
          ...mod,
          superficies: {
            ...originalHistorico.superficies,
            ...mod.superficies,
          },
        };
      }

      // Si aún no ha sido modificada, clonar superficialmente el original histórico
      const supsIniciales = {};
      for (const sKey of SUPERFICIES_ESTANDAR) {
        supsIniciales[sKey] = {
          superficie: sKey,
          condicion: originalHistorico.superficies?.[sKey]?.condicion || CONDICION_SUPERFICIE.NO_EVALUADA,
          evaluada: originalHistorico.superficies?.[sKey]?.evaluada || false,
        };
      }

      return {
        ...originalHistorico,
        estadoAnatomico: originalHistorico.estadoAnatomico || ESTADO_ANATOMICO.DESCONOCIDO,
        superficies: supsIniciales,
        tratamientoEstructuralAgregado: null,
        observaciones: originalHistorico.observaciones || '',
      };
    },
    [piezasHistoricasMap, borradorModificaciones],
  );

  /**
   * Prepara o actualiza modificaciones sobre una pieza en el borrador de la enmienda.
   */
  const prepararCambioPieza = useCallback(
    (numeroFDI, cambiosParciales) => {
      if (!modoEnmienda || !revisionCorregida?.id) return false;

      const piezaActual = obtenerPiezaBorrador(numeroFDI);
      if (!piezaActual) return false;

      const piezaActualizada = {
        ...piezaActual,
        ...cambiosParciales,
        superficies: {
          ...piezaActual.superficies,
          ...(cambiosParciales.superficies || {}),
        },
      };

      // Validar invariantes clínicas en el borrador
      const validacion = validarInvariantesBorrador(
        numeroFDI,
        piezaActualizada.estadoAnatomico,
        piezaActualizada.superficies,
        piezaActualizada.tratamientoEstructuralAgregado,
      );

      if (!validacion.esValido) {
        setErrorValidacion(validacion.error);
        return false;
      }

      setErrorValidacion(null);

      // Si el estado anatómico cambia a no PRESENTE (ej. EXTRAIDO o AUSENTE), reiniciar superficies
      if (
        piezaActualizada.estadoAnatomico &&
        piezaActualizada.estadoAnatomico !== ESTADO_ANATOMICO.PRESENTE
      ) {
        const supsLimpias = {};
        for (const sKey of SUPERFICIES_ESTANDAR) {
          supsLimpias[sKey] = {
            superficie: sKey,
            condicion: CONDICION_SUPERFICIE.NO_EVALUADA,
            evaluada: false,
          };
        }
        piezaActualizada.superficies = supsLimpias;
      }

      setBorradorModificaciones((prev) => ({
        ...prev,
        [numeroFDI]: piezaActualizada,
      }));

      return true;
    },
    [modoEnmienda, revisionCorregida?.id, obtenerPiezaBorrador],
  );

  /**
   * Revierte y descarta las modificaciones de una pieza específica en la enmienda.
   */
  const descartarCambiosPieza = useCallback((numeroFDI) => {
    setBorradorModificaciones((prev) => {
      const nuevo = { ...prev };
      delete nuevo[numeroFDI];
      return nuevo;
    });
    setErrorValidacion(null);
  }, []);

  /**
   * Descarta la totalidad de los cambios preparados en el borrador de enmienda.
   */
  const descartarTodo = useCallback(() => {
    setBorradorModificaciones({});
    setErrorValidacion(null);
  }, []);

  // Calcular deltas atómicos contra el snapshot histórico corregido (NO contra el odontograma actual)
  const deltas = useMemo(() => {
    if (!revisionCorregida?.snapshotPiezas) return [];
    return calcularDeltasOdontograma(revisionCorregida.snapshotPiezas, borradorModificaciones);
  }, [revisionCorregida, borradorModificaciones]);

  const resumen = useMemo(() => {
    if (!revisionCorregida?.snapshotPiezas) {
      return { hayCambios: false, piezasModificadas: 0, deltas: [] };
    }
    return resumirCambiosBorrador(revisionCorregida.snapshotPiezas, borradorModificaciones);
  }, [revisionCorregida, borradorModificaciones]);

  // Mapa combinado de piezas para la visualización en la arcada histórica mientras se edita la enmienda
  const piezasProyectadasMap = useMemo(() => {
    if (!revisionCorregida?.snapshotPiezas) return {};
    const map = {};
    for (const p of revisionCorregida.snapshotPiezas) {
      if (p && p.numeroFDI) {
        map[p.numeroFDI] = borradorModificaciones[p.numeroFDI] || p;
      }
    }
    return map;
  }, [revisionCorregida, borradorModificaciones]);

  const fdisModificadosSet = useMemo(() => {
    return new Set(deltas.map((d) => d.numeroFDI));
  }, [deltas]);

  // Metadatos clínicos de la enmienda
  const metadatosEnmienda = useMemo(() => {
    const fechaISO = fechaObservacion ? new Date(fechaObservacion).toISOString() : '';
    return {
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
      revisionCorregidaId: revisionCorregida?.id || null,
      fechaObservacionClinica: fechaISO,
      motivoRevision: motivoRevision.trim(),
      consultaId: consultaId.trim() || null,
      aplicaAlEstadoActual: false, // Invariante: las enmiendas retrospectivas no alteran el presente
    };
  }, [revisionCorregida?.id, fechaObservacion, motivoRevision, consultaId]);

  // Validación de metadatos clínicos
  const validacionMetadatos = useMemo(() => {
    return validarMetadatosRevision(metadatosEnmienda, deltas, {
      soporteSnapshotHistorico: true,
    });
  }, [metadatosEnmienda, deltas]);

  // Construcción del payload final exacto garantizando concurrencia optimista inmutable
  const payloadGenerado = useMemo(() => {
    if (!odontogramaActual || !validacionMetadatos.esValido || versionEsperadaOriginal === null) {
      return null;
    }
    try {
      // Invariante INV-ODO-06: El payload conserva la versión esperada fijada al iniciar el borrador.
      // Si el servidor avanza a una versión superior, NO se sustituye silenciosamente.
      const baseParaPayload = {
        ...odontogramaActual,
        version: versionEsperadaOriginal,
      };

      return construirPayloadRevision({
        odontogramaActual: baseParaPayload,
        metadatos: metadatosEnmienda,
        deltas,
        opciones: { soporteSnapshotHistorico: true },
      });
    } catch {
      return null;
    }
  }, [odontogramaActual, versionEsperadaOriginal, metadatosEnmienda, deltas, validacionMetadatos.esValido]);

  /**
   * Permite preparar nuevamente la enmienda tras una revisión explícita del profesional,
   * actualizando la versión esperada a la versión vigente del servidor sin perder
   * las modificaciones del borrador ni la base histórica.
   */
  const revisarYAlinearConflicto = useCallback(() => {
    if (!odontogramaActual?.version) return false;
    setVersionEsperadaOriginal(odontogramaActual.version);
    setConflictoRevisadoConsciente(true);
    setErrorValidacion(null);
    return true;
  }, [odontogramaActual]);

  return {
    modoEnmienda,
    revisionCorregida,
    piezasHistoricasMap,
    piezasProyectadasMap,
    borradorModificaciones,
    fdisModificadosSet,
    deltas,
    resumen,
    motivoRevision,
    fechaObservacion,
    consultaId,
    errorValidacion,
    versionActualCambio,
    versionEsperadaOriginal,
    conflictoRevisadoConsciente,
    setConflictoRevisadoConsciente,
    versionEsperada: versionEsperadaOriginal ?? odontogramaActual?.version ?? 1,
    validacionMetadatos,
    payloadGenerado,
    setMotivoRevision,
    setFechaObservacion,
    setConsultaId,
    iniciarEnmienda,
    salirModoEnmienda,
    obtenerPiezaBorrador,
    prepararCambioPieza,
    descartarCambiosPieza,
    descartarTodo,
    revisarYAlinearConflicto,
    limpiarErrorValidacion: () => setErrorValidacion(null),
  };
}
