import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  calcularDeltasOdontograma,
  resumirCambiosBorrador,
  validarInvariantesBorrador,
} from '../utils/odontograma-deltas.js';
import {
  ESTADO_ANATOMICO,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
} from '../constants/odontograma.constants.js';

const SUPERFICIES_ESTANDAR = [
  TIPO_SUPERFICIE.VESTIBULAR,
  TIPO_SUPERFICIE.PALATINA_LINGUAL,
  TIPO_SUPERFICIE.MESIAL,
  TIPO_SUPERFICIE.DISTAL,
  TIPO_SUPERFICIE.OCLUSAL_INCISAL,
];

/**
 * Hook para la gestión del ciclo de vida del borrador clínico en memoria (Iteración 7F-3A).
 *
 * Características:
 * - Estrictamente en memoria (sin persistencia en localStorage ni sessionStorage).
 * - Separación total entre snapshot del servidor y modificaciones del borrador.
 * - Descarte automático si cambia el expediente o la versión del odontograma.
 * - Sin peticiones HTTP ni escrituras automáticas.
 *
 * @param {object|null} odontogramaOriginal - OdontogramaActualDto proveniente del servidor
 * @param {string} historiaClinicaId - Identificador de la historia clínica activa
 */
export function useOdontogramaEditor(odontogramaOriginal, historiaClinicaId = '') {
  const [modoEdicion, setModoEdicion] = useState(false);
  const [borradorModificaciones, setBorradorModificaciones] = useState({});
  const [errorValidacion, setErrorValidacion] = useState(null);

  const prevHistoriaIdRef = useRef(historiaClinicaId);
  const prevVersionRef = useRef(odontogramaOriginal?.version);

  // Mapear piezas del snapshot original para acceso O(1)
  const piezasOriginalesMap = useMemo(() => {
    if (!odontogramaOriginal?.piezas || !Array.isArray(odontogramaOriginal.piezas)) {
      return {};
    }
    const map = {};
    for (const p of odontogramaOriginal.piezas) {
      if (p && p.numeroFDI) {
        map[p.numeroFDI] = p;
      }
    }
    return map;
  }, [odontogramaOriginal]);

  // Si cambia la historia clínica o la versión del odontograma, limpiar inmediatamente el borrador
  useEffect(() => {
    if (
      prevHistoriaIdRef.current !== historiaClinicaId ||
      prevVersionRef.current !== odontogramaOriginal?.version
    ) {
      setBorradorModificaciones({});
      setModoEdicion(false);
      setErrorValidacion(null);
      prevHistoriaIdRef.current = historiaClinicaId;
      prevVersionRef.current = odontogramaOriginal?.version;
    }
  }, [historiaClinicaId, odontogramaOriginal?.version]);

  /**
   * Habilita el modo de edición si existe un odontograma real inicializado.
   */
  const iniciarEdicion = useCallback(() => {
    if (!odontogramaOriginal?.id) {
      return false; // Edición bloqueada cuando no existe odontograma en el servidor
    }
    setModoEdicion(true);
    setErrorValidacion(null);
    return true;
  }, [odontogramaOriginal?.id]);

  /**
   * Sale del modo de edición y descarta los cambios no confirmados.
   */
  const salirModoEdicion = useCallback(() => {
    setModoEdicion(false);
    setBorradorModificaciones({});
    setErrorValidacion(null);
  }, []);

  /**
   * Obtiene la copia de trabajo borrador de una pieza, combinando el original con sus cambios locales.
   */
  const obtenerPiezaBorrador = useCallback(
    (numeroFDI) => {
      const original = piezasOriginalesMap[numeroFDI];
      if (!original) return null;

      const mod = borradorModificaciones[numeroFDI];
      if (mod) {
        return {
          ...original,
          ...mod,
          superficies: {
            ...original.superficies,
            ...mod.superficies,
          },
        };
      }

      // Si aún no ha sido modificada, clonar superficialmente el original
      const supsIniciales = {};
      for (const sKey of SUPERFICIES_ESTANDAR) {
        supsIniciales[sKey] = {
          superficie: sKey,
          condicion: original.superficies?.[sKey]?.condicion || CONDICION_SUPERFICIE.NO_EVALUADA,
          evaluada: original.superficies?.[sKey]?.evaluada || false,
        };
      }

      return {
        ...original,
        estadoAnatomico: original.estadoAnatomico || ESTADO_ANATOMICO.DESCONOCIDO,
        superficies: supsIniciales,
        tratamientoEstructuralAgregado: null,
        observaciones: original.observaciones || '',
      };
    },
    [piezasOriginalesMap, borradorModificaciones],
  );

  /**
   * Prepara o actualiza modificaciones sobre una pieza en el borrador local.
   */
  const prepararCambioPieza = useCallback(
    (numeroFDI, cambiosParciales) => {
      if (!odontogramaOriginal?.id) return false;

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

      // Si el estado anatómico cambia a no PRESENTE (ej. EXTRAIDO o AUSENTE),
      // reiniciar superficies a NO_EVALUADA
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
    [odontogramaOriginal?.id, obtenerPiezaBorrador],
  );

  /**
   * Revierte y descarta las modificaciones de una pieza específica volviendo a su estado original.
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
   * Descarta la totalidad de los cambios preparados en el borrador.
   */
  const descartarTodo = useCallback(() => {
    setBorradorModificaciones({});
    setErrorValidacion(null);
  }, []);

  // Calcular deltas y resumen comparando contra el snapshot original
  const deltas = useMemo(() => {
    return calcularDeltasOdontograma(odontogramaOriginal, borradorModificaciones);
  }, [odontogramaOriginal, borradorModificaciones]);

  const resumen = useMemo(() => {
    return resumirCambiosBorrador(odontogramaOriginal, borradorModificaciones);
  }, [odontogramaOriginal, borradorModificaciones]);

  // Mapa combinado de piezas para la visualización en la arcada mientras se edita
  const piezasProyectadasMap = useMemo(() => {
    if (!odontogramaOriginal?.piezas) return {};
    const map = {};
    for (const p of odontogramaOriginal.piezas) {
      if (p && p.numeroFDI) {
        map[p.numeroFDI] = borradorModificaciones[p.numeroFDI] || p;
      }
    }
    return map;
  }, [odontogramaOriginal, borradorModificaciones]);

  const fdisModificadosSet = useMemo(() => {
    return new Set(deltas.map((d) => d.numeroFDI));
  }, [deltas]);

  return {
    modoEdicion,
    puedeEditar: Boolean(odontogramaOriginal?.id),
    versionEsperada: odontogramaOriginal?.version || 1,
    borradorModificaciones,
    fdisModificadosSet,
    deltas,
    resumen,
    piezasProyectadasMap,
    errorValidacion,
    iniciarEdicion,
    salirModoEdicion,
    obtenerPiezaBorrador,
    prepararCambioPieza,
    descartarCambiosPieza,
    descartarTodo,
    limpiarErrorValidacion: () => setErrorValidacion(null),
  };
}
