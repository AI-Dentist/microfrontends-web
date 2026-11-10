// Synthetic agendamiento and ML cluster fixtures for platform browser smoke.
// Conforms to MS3 API response envelope and spending display requirements.

export const PATIENT_IDS = {
  REAL: '11111111-1111-4111-8111-000000000001',
  ZERO: '11111111-1111-4111-8111-000000000002',
  FALLBACK: '11111111-1111-4111-8111-000000000003',
};

export const citasFixture = {
  success: true,
  data: {
    mlDisponible: true,
    citas: [
      {
        id: 'c-real-00000001',
        paciente_id: PATIENT_IDS.REAL,
        odontologo_id: 'od-00000001',
        consultorio_id: 'co-00000001',
        estado: 'CONFIRMADA',
        fecha_hora: '2026-11-20 09:00:00',
        datosEntrenamientoSinteticos: true,
      },
      {
        id: 'c-zero-00000002',
        paciente_id: PATIENT_IDS.ZERO,
        odontologo_id: 'od-00000001',
        consultorio_id: 'co-00000001',
        estado: 'CONFIRMADA',
        fecha_hora: '2026-11-20 10:00:00',
        datosEntrenamientoSinteticos: true,
      },
      {
        id: 'c-fallback-0003',
        paciente_id: PATIENT_IDS.FALLBACK,
        odontologo_id: 'od-00000001',
        consultorio_id: 'co-00000001',
        estado: 'RESERVADA',
        fecha_hora: '2026-11-20 11:00:00',
        datosEntrenamientoSinteticos: true,
      },
    ],
  },
  citas: [],
};
citasFixture.citas = citasFixture.data.citas;

export const clustersFixture = {
  success: true,
  data: {
    pacientes: {
      distribucion: {
        'Frecuente y Puntual': 1,
        'Primera Vez': 1,
        'Esporádico': 1,
      },
      asignaciones: [
        {
          paciente_id: PATIENT_IDS.REAL,
          cluster: 'Frecuente y Puntual',
          gasto_total_real: 240,
          gasto_total_estimado: 180,
          gasto_moneda: 'BOB',
          gasto_origen: 'real_ms1_pagado',
          gasto_real_observado: true,
          featuresEstimadas: ['gasto_total_estimado'],
          datosEntrenamientoSinteticos: true,
        },
        {
          paciente_id: PATIENT_IDS.ZERO,
          cluster: 'Primera Vez',
          gasto_total_real: 0,
          gasto_total_estimado: 120,
          gasto_moneda: 'BOB',
          gasto_origen: 'real_ms1_pagado',
          gasto_real_observado: true,
          featuresEstimadas: ['gasto_total_estimado'],
          datosEntrenamientoSinteticos: true,
        },
        {
          paciente_id: PATIENT_IDS.FALLBACK,
          cluster: 'Esporádico',
          gasto_total_real: null,
          gasto_total_estimado: 180,
          gasto_moneda: 'BOB',
          gasto_origen: 'estimado_fallback',
          gasto_real_observado: false,
          featuresEstimadas: ['gasto_total_estimado'],
          datosEntrenamientoSinteticos: true,
        },
      ],
    },
    stock: {
      distribucion: { 'Alta Rotación Crítica': 1 },
      asignaciones: [
        {
          insumo_id: 'ins-00000001',
          cluster: 'Alta Rotación Crítica',
          featuresEstimadas: ['rotacion_estimada'],
        },
      ],
    },
    insumos: {
      distribucion: { 'Alta Rotación Crítica': 1 },
      asignaciones: [
        {
          insumo_id: 'ins-00000001',
          cluster: 'Alta Rotación Crítica',
          featuresEstimadas: ['rotacion_estimada'],
        },
      ],
    },
    datosEntrenamientoSinteticos: true,
  },
};
