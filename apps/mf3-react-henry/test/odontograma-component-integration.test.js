import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Registrar cargador JSX ligero compatible con React 19 y Node 24
register('./helpers/jsx-loader.mjs', import.meta.url);

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  ESTADO_ANATOMICO,
  ESTADO_EVALUACION,
  CONDICION_SUPERFICIE,
  TIPO_SUPERFICIE,
  TIPO_REVISION_ODONTOGRAMA,
  PIEZAS_FDI_VALIDAS_SET,
} from '../src/constants/odontograma.constants.js';

// Generador sintético de odontograma de 52 piezas para pruebas de componentes
function crearOdontogramaPrueba({
  historiaClinicaId = 'hc_test_integracion_001',
  version = 5,
  piezasModificadas = {},
} = {}) {
  const piezas = Array.from(PIEZAS_FDI_VALIDAS_SET).map((numeroFDI) => {
    const mod = piezasModificadas[numeroFDI] || {};
    return {
      numeroFDI,
      estadoAnatomico: mod.estadoAnatomico || ESTADO_ANATOMICO.PRESENTE,
      estadoEvaluacion: mod.estadoEvaluacion || ESTADO_EVALUACION.EVALUADO,
      superficies: mod.superficies || {
        VESTIBULAR: { superficie: TIPO_SUPERFICIE.VESTIBULAR, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        PALATINA_LINGUAL: { superficie: TIPO_SUPERFICIE.PALATINA_LINGUAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        MESIAL: { superficie: TIPO_SUPERFICIE.MESIAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        DISTAL: { superficie: TIPO_SUPERFICIE.DISTAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
      },
      tratamientosEstructurales: mod.tratamientosEstructurales || [],
      observaciones: mod.observaciones || null,
    };
  });

  return {
    id: `odo_${historiaClinicaId}`,
    historiaClinicaId,
    pacienteId: 'pac_test_001',
    revisionActualId: 'rev_base_001',
    totalRevisiones: 1,
    version,
    creadoEn: '2026-10-26T10:00:00.000Z',
    actualizadoEn: '2026-10-26T10:00:00.000Z',
    actualizadoPor: 'odonto_henry',
    piezas,
  };
}

describe('Iteración 7F-5 — Auditoría Técnica e Integración Funcional de Componentes React', () => {
  let OdontogramaViewer;
  let ArcadaDental;
  let SuperficiesDentales;
  let DetallePiezaDental;
  let EditorPiezaDental;
  let PanelCambiosPendientes;
  let ModalRegistrarRevision;
  let ModalRegistrarEnmienda;
  let HistorialOdontograma;
  let SnapshotHistoricoViewer;

  before(async () => {
    const mViewer = await import('../src/components/odontograma/OdontogramaViewer.jsx');
    const mArcada = await import('../src/components/odontograma/ArcadaDental.jsx');
    const mSuperficies = await import('../src/components/odontograma/SuperficiesDentales.jsx');
    const mDetalle = await import('../src/components/odontograma/DetallePiezaDental.jsx');
    const mEditor = await import('../src/components/odontograma/EditorPiezaDental.jsx');
    const mPanel = await import('../src/components/odontograma/PanelCambiosPendientes.jsx');
    const mModRev = await import('../src/components/odontograma/ModalRegistrarRevision.jsx');
    const mModEnm = await import('../src/components/odontograma/ModalRegistrarEnmienda.jsx');
    const mHist = await import('../src/components/odontograma/HistorialOdontograma.jsx');
    const mSnap = await import('../src/components/odontograma/SnapshotHistoricoViewer.jsx');

    OdontogramaViewer = mViewer.OdontogramaViewer;
    ArcadaDental = mArcada.ArcadaDental;
    SuperficiesDentales = mSuperficies.SuperficiesDentales;
    DetallePiezaDental = mDetalle.DetallePiezaDental;
    EditorPiezaDental = mEditor.EditorPiezaDental;
    PanelCambiosPendientes = mPanel.PanelCambiosPendientes;
    ModalRegistrarRevision = mModRev.ModalRegistrarRevision;
    ModalRegistrarEnmienda = mModEnm.ModalRegistrarEnmienda;
    HistorialOdontograma = mHist.HistorialOdontograma;
    SnapshotHistoricoViewer = mSnap.SnapshotHistoricoViewer;
  });

  // 1. Renderizar una historia sin odontograma (404 Empty State)
  test('1. Renderizado de historia clínica sin odontograma previo (Estado 404 Vacío)', () => {
    const html = renderToStaticMarkup(
      React.createElement(OdontogramaViewer, {
        odontograma: null,
        error: { status: 404, title: 'No encontrado', detail: 'Odontograma no inicializado' },
        historiaClinicaId: 'hc_sin_odontograma_404',
      })
    );

    assert.ok(html.includes('Expediente sin Odontograma Inicializado'), 'Debe mostrar el título de estado vacío 404');
    assert.ok(html.includes('hc_sin_odontograma_404'), 'Debe reflejar la historia clínica consultada');
    assert.ok(!html.includes('Preparar edición'), 'No debe habilitar botones de edición sin odontograma');
    assert.ok(!html.includes('Arcada Superior'), 'No debe renderizar arcadas dentales');
  });

  // 2. Renderizar odontograma consolidado con 52 posiciones FDI
  test('2. Renderizado de odontograma consolidado con las 52 posiciones FDI completas', () => {
    const odo = crearOdontogramaPrueba({ version: 5 });
    const html = renderToStaticMarkup(
      React.createElement(OdontogramaViewer, {
        odontograma: odo,
        historiaClinicaId: odo.historiaClinicaId,
      })
    );

    assert.ok(html.includes('Odontograma Longitudinal Consolidado'));
    assert.ok(html.includes('v5'));
    assert.ok(html.includes('Maxilar Superior — Dentición Permanente'));

    // Verificar presencia de posiciones clave permanentes y temporales
    for (const fdi of [18, 11, 21, 28, 38, 48, 55, 51, 61, 75, 85]) {
      assert.ok(html.includes(`pieza-dental-btn`), 'Debe renderizar botones anatómicos de piezas');
      assert.ok(html.includes(`data-fdi="${fdi}"`), `Debe contener la pieza FDI ${fdi}`);
    }

    // Renderizado unitario directo de ArcadaDental
    const arcadaHtml = renderToStaticMarkup(
      React.createElement(ArcadaDental, {
        piezasMap: {},
        selectedNumeroFDI: 11,
      })
    );
    assert.ok(arcadaHtml.includes('Maxilar Superior — Dentición Permanente'));
  });

  // 3. Seleccionar pieza y mostrar su ficha de detalle
  test('3. Ficha anatómica y de detalle de pieza seleccionada', () => {
    const pieza = {
      numeroFDI: 16,
      estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      estadoEvaluacion: ESTADO_EVALUACION.EVALUADO,
      superficies: {
        OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.CARIES, evaluada: true },
        VESTIBULAR: { superficie: TIPO_SUPERFICIE.VESTIBULAR, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        PALATINA_LINGUAL: { superficie: TIPO_SUPERFICIE.PALATINA_LINGUAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        MESIAL: { superficie: TIPO_SUPERFICIE.MESIAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
        DISTAL: { superficie: TIPO_SUPERFICIE.DISTAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
      },
      tratamientosEstructurales: [],
      observaciones: 'Foseta pigmentada con lesión activa',
    };

    const html = renderToStaticMarkup(
      React.createElement(DetallePiezaDental, {
        numeroFDI: 16,
        pieza,
      })
    );

    assert.ok(html.includes('Pieza FDI 16'));
    assert.ok(html.includes('Primer Molar'));
    assert.ok(html.includes('Foseta pigmentada'));
  });

  // 4. Componente SuperficiesDentales con 5 superficies FDI
  test('4. Renderizado de las 5 superficies anatómicas en cruz clínica', () => {
    const superficies = {
      VESTIBULAR: { superficie: TIPO_SUPERFICIE.VESTIBULAR, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
      PALATINA_LINGUAL: { superficie: TIPO_SUPERFICIE.PALATINA_LINGUAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
      MESIAL: { superficie: TIPO_SUPERFICIE.MESIAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
      DISTAL: { superficie: TIPO_SUPERFICIE.DISTAL, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
      OCLUSAL_INCISAL: { superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicion: CONDICION_SUPERFICIE.CARIES, evaluada: true },
    };

    const html = renderToStaticMarkup(
      React.createElement(SuperficiesDentales, {
        numeroFDI: 16,
        superficies,
      })
    );

    assert.ok(html.includes('superficies-svg-container'));
    assert.ok(html.includes('superficie-sector'));
    assert.ok(html.includes('condicion-CARIES'));
  });

  // 5. EditorPiezaDental en modo preparación de cambios clínicos
  test('5. Editor clínico local de pieza dental en borrador', () => {
    const piezaOriginal = {
      numeroFDI: 21,
      estadoAnatomico: ESTADO_ANATOMICO.PRESENTE,
      superficies: {
        VESTIBULAR: { superficie: TIPO_SUPERFICIE.VESTIBULAR, condicion: CONDICION_SUPERFICIE.SANA, evaluada: true },
      },
    };
    const piezaBorrador = {
      ...piezaOriginal,
      superficies: {
        VESTIBULAR: { superficie: TIPO_SUPERFICIE.VESTIBULAR, condicion: CONDICION_SUPERFICIE.OBTURADA, evaluada: true },
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(EditorPiezaDental, {
        numeroFDI: 21,
        piezaOriginal,
        piezaBorrador,
        tieneCambios: true,
        onActualizar: () => {},
        onDescartar: () => {},
      })
    );

    assert.ok(html.includes('Editar Pieza FDI 21'));
    assert.ok(html.includes('Modificada en borrador'));
    assert.ok(html.includes('Descartar Cambios de Pieza'));
  });

  // 6. PanelCambiosPendientes resume las piezas modificadas en memoria
  test('6. Panel de cambios pendientes con conteo anatómico de deltas', () => {
    const resumen = {
      hayCambios: true,
      piezasModificadas: 2,
      totalPiezasModificadas: 2,
      totalSuperficiesModificadas: 3,
      totalCambiosAnatomicos: 0,
      totalTratamientosAgregados: 1,
    };
    const deltas = [
      {
        numeroFDI: 16,
        superficiesModificadas: [{ superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicionAnterior: CONDICION_SUPERFICIE.SANA, condicionNueva: CONDICION_SUPERFICIE.CARIES }],
      },
      {
        numeroFDI: 21,
        superficiesModificadas: [{ superficie: TIPO_SUPERFICIE.VESTIBULAR, condicionAnterior: CONDICION_SUPERFICIE.SANA, condicionNueva: CONDICION_SUPERFICIE.OBTURADA }],
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(PanelCambiosPendientes, {
        resumen,
        deltas,
        onDescartarPieza: () => {},
        onDescartarTodo: () => {},
        onSalir: () => {},
        onAbrirRegistroRevision: () => {},
      })
    );

    assert.ok(html.includes('Borrador Clínico sin Guardar'));
    assert.ok(html.includes('piezas modificadas'));
    assert.ok(html.includes('FDI 16'));
    assert.ok(html.includes('FDI 21'));
  });

  // 7. ModalRegistrarRevision con validación de metadatos clínicos
  test('7. Modal de registro de revisión (NUEVA_OBSERVACION) con bloqueo en standalone', () => {
    const odo = crearOdontogramaPrueba({ version: 5 });
    const deltas = [
      {
        numeroFDI: 16,
        superficiesModificadas: [{ superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicionAnterior: CONDICION_SUPERFICIE.SANA, condicionNueva: CONDICION_SUPERFICIE.CARIES }],
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(ModalRegistrarRevision, {
        isOpen: true,
        onClose: () => {},
        odontograma: odo,
        deltas,
        resumen: { hayCambios: true, totalPiezasModificadas: 1 },
        escrituraHabilitada: false, // Standalone protegido
      })
    );

    assert.ok(html.includes('Registrar Revisión Odontográfica'));
    assert.ok(html.includes('Standalone MongoDB'));
    assert.ok(html.includes('v5 del servidor'));
    assert.ok(html.includes('NUEVA_OBSERVACION'));
  });

  // 8. HistorialOdontograma con lista cronológica y paginación
  test('8. Listado longitudinal de revisiones históricas con badges de auditoría', () => {
    const historial = {
      total: 3,
      limite: 20,
      offset: 0,
      revisiones: [
        {
          id: 'rev_3',
          numeroRevision: 3,
          tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
          aplicaAlEstadoActual: true,
          fechaRegistro: '2026-10-26T12:00:00.000Z',
          fechaObservacionClinica: '2026-10-26T11:45:00.000Z',
          motivoRevision: 'Obturación con resina compuesta en pieza 16',
          registradoPor: 'odonto_henry',
          cambiosAplicados: [{ numeroFDI: 16 }],
        },
        {
          id: 'rev_2',
          numeroRevision: 2,
          tipoRevision: TIPO_REVISION_ODONTOGRAMA.ENMIENDA_CORRECTIVA,
          revisionCorregidaId: 'rev_1',
          aplicaAlEstadoActual: false,
          fechaRegistro: '2026-10-26T11:00:00.000Z',
          fechaObservacionClinica: '2026-10-26T10:30:00.000Z',
          motivoRevision: 'Rectificación de diagnóstico retrospectivo',
          registradoPor: 'odonto_henry',
          cambiosAplicados: [{ numeroFDI: 21 }],
        },
      ],
    };

    const html = renderToStaticMarkup(
      React.createElement(HistorialOdontograma, {
        odontogramaId: 'odo_001',
        historial,
        onCargarPagina: () => {},
        onSeleccionarRevision: () => {},
        onIniciarEnmienda: () => {},
      })
    );

    assert.ok(html.includes('Historial Longitudinal del Odontograma'));
    assert.ok(html.includes('Rev #3'));
    assert.ok(html.includes('Rev #2'));
    assert.ok(html.includes('Enmienda Correctiva'));
    assert.ok(html.includes('Nueva Observación'));
  });

  // 9. SnapshotHistoricoViewer en modo solo lectura inmutable
  test('9. Visor inmutable de snapshot histórico sellado (Solo lectura)', () => {
    const revision = {
      id: 'rev_1',
      numeroRevision: 1,
      tipoRevision: TIPO_REVISION_ODONTOGRAMA.NUEVA_OBSERVACION,
      fechaRegistro: '2026-10-26T10:00:00.000Z',
      fechaObservacionClinica: '2026-10-26T09:30:00.000Z',
      motivoRevision: 'Apertura de odontograma basal',
      registradoPor: 'odonto_henry',
      snapshotPiezas: Array.from(PIEZAS_FDI_VALIDAS_SET).map((numeroFDI) => ({
        numeroFDI,
        estadoAnatomico: ESTADO_ANATOMICO.DESCONOCIDO,
        estadoEvaluacion: ESTADO_EVALUACION.NO_EVALUADO,
        superficies: {},
      })),
    };

    const html = renderToStaticMarkup(
      React.createElement(SnapshotHistoricoViewer, {
        revision,
        onVolver: () => {},
        onIniciarEnmienda: () => {},
      })
    );

    assert.ok(html.includes('Snapshot Histórico Inmutable'));
    assert.ok(html.includes('Solo Lectura'));
    assert.ok(html.includes('Revisión #1'));
    assert.ok(html.includes('Preparar Enmienda de esta Revisión'));
  });

  // 10. ModalRegistrarEnmienda: Detección y bloqueo de conflicto optimista v5 -> v6
  test('10. Modal de Enmienda Correctiva: Alerta y bloqueo estricto ante conflicto v5 -> v6', () => {
    const odoActual = crearOdontogramaPrueba({ version: 6 }); // Servidor avanzó a v6
    const revisionCorregida = {
      id: 'rev_historica_001',
      numeroRevision: 2,
      snapshotPiezas: Array.from(PIEZAS_FDI_VALIDAS_SET).map((n) => ({ numeroFDI: n, superficies: {} })),
    };
    const deltas = [
      {
        numeroFDI: 16,
        superficiesModificadas: [{ superficie: TIPO_SUPERFICIE.OCLUSAL_INCISAL, condicionAnterior: CONDICION_SUPERFICIE.CARIES, condicionNueva: CONDICION_SUPERFICIE.OBTURADA }],
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(ModalRegistrarEnmienda, {
        isOpen: true,
        onClose: () => {},
        odontograma: odoActual,
        revisionCorregida,
        deltas,
        resumen: { hayCambios: true, totalPiezasModificadas: 1 },
        motivoRevision: 'Enmienda de prueba de concurrencia optimista',
        onMotivoChange: () => {},
        fechaObservacion: '2026-10-26T10:00',
        onFechaObservacionChange: () => {},
        validacionMetadatos: { esValido: true, errores: {} },
        payloadGenerado: { versionEsperada: 5 },
        versionActualCambio: true, // Conflicto activo
        versionEsperadaOriginal: 5, // Borrador iniciado en v5
        onResolverConflicto: () => {},
      })
    );

    assert.ok(html.includes('Conflicto de Concurrencia Optimista (INV-ODO-06)'));
    assert.ok(html.includes('v5'));
    assert.ok(html.includes('v6'));
    assert.ok(html.includes('ratifico conscientemente'));
    assert.ok(html.includes('disabled=""') || html.includes('disabled'), 'El botón de confirmación debe estar deshabilitado');
  });

  // 11. ModalRegistrarEnmienda: Invariante retrospectiva pura (aplicaAlEstadoActual = false)
  test('11. Modal de Enmienda Correctiva: Invariante aplicaAlEstadoActual = false inalterable', () => {
    const odoActual = crearOdontogramaPrueba({ version: 5 });
    const revisionCorregida = {
      id: 'rev_historica_001',
      numeroRevision: 2,
      snapshotPiezas: Array.from(PIEZAS_FDI_VALIDAS_SET).map((n) => ({ numeroFDI: n, superficies: {} })),
    };

    const html = renderToStaticMarkup(
      React.createElement(ModalRegistrarEnmienda, {
        isOpen: true,
        onClose: () => {},
        odontograma: odoActual,
        revisionCorregida,
        deltas: [],
        resumen: {},
        motivoRevision: 'Test motivo',
        onMotivoChange: () => {},
        fechaObservacion: '2026-10-26T10:00',
        onFechaObservacionChange: () => {},
        validacionMetadatos: { esValido: false, errores: {} },
        payloadGenerado: null,
      })
    );

    assert.ok(html.includes('Enmienda retrospectiva pura'));
    assert.ok(html.includes('aplicaAlEstadoActual = false'));
    assert.ok(html.includes('revisionCorregidaId'));
    assert.ok(html.includes('rev_historica_001'));
  });

  // 12. ModalRegistrarRevision: Simulación "Simulación — No guardado"
  test('12. Modal de Revisión: Banner claro de simulación sin mutación real', () => {
    const odo = crearOdontogramaPrueba({ version: 5 });
    const html = renderToStaticMarkup(
      React.createElement(ModalRegistrarRevision, {
        isOpen: true,
        onClose: () => {},
        odontograma: odo,
        deltas: [{ numeroFDI: 16 }],
        resumen: { hayCambios: true },
        onSimularEnvio: () => {},
      })
    );

    assert.ok(html.includes('Simulación — No guardado'));
  });
});
