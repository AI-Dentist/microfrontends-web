/**
 * Patient cluster spending resolver and validator (MS3 ML integration).
 *
 * Requirements:
 * - Strictly numeric finite non-negative values; no string coercion or flags.
 * - Currency must be 'BOB' (symbol 'Bs'); no currency forgery for invalid payloads.
 * - Real spending requires gasto_real_observado === true, finite non-negative gasto_total_real,
 *   gasto_moneda === 'BOB', and gasto_origen === 'real_ms1_pagado'.
 * - Estimated reference spending requires finite non-negative gasto_total_estimado and
 *   consistent currency (BOB or omitted).
 * - If real is unobserved/invalid, safely falls back to estimated reference without nominal as real.
 * - If estimated is also invalid/missing, renders explicit unavailable (never invented zero).
 * - Client performs NO financial derivations; validation and formatting only.
 */

export function resolvePatientSpending(assignment) {
  if (!assignment || typeof assignment !== 'object') {
    return {
      hasReal: false,
      realAmount: null,
      hasEstimated: false,
      estimatedAmount: null,
      isUnavailable: true,
    };
  }

  const {
    gasto_total_real,
    gasto_total_estimado,
    gasto_moneda,
    gasto_origen,
    gasto_real_observado,
  } = assignment;

  // Strict boolean check: no truthy coercion, string "true" is rejected
  const isObserved = gasto_real_observado === true;

  // Strict numeric check for real amount: must be finite, non-negative number (0 is valid)
  const isValidReal = typeof gasto_total_real === 'number'
    && Number.isFinite(gasto_total_real)
    && gasto_total_real >= 0;

  // Strict provenance check for real amount
  const isRealProvenanceValid = gasto_moneda === 'BOB' && gasto_origen === 'real_ms1_pagado';

  const hasReal = isObserved && isValidReal && isRealProvenanceValid;

  // Strict numeric check for estimated amount
  const isValidEstimated = typeof gasto_total_estimado === 'number'
    && Number.isFinite(gasto_total_estimado)
    && gasto_total_estimado >= 0;

  // Currency consistency: must be 'BOB' or undefined in legacy; never forge 'Bs' for other currencies
  const isCurrencyValidForEstimate = gasto_moneda === undefined || gasto_moneda === 'BOB';

  const hasEstimated = isValidEstimated && isCurrencyValidForEstimate;

  const isUnavailable = !hasReal && !hasEstimated;

  return {
    hasReal,
    realAmount: hasReal ? gasto_total_real : null,
    hasEstimated,
    estimatedAmount: hasEstimated ? gasto_total_estimado : null,
    isUnavailable,
  };
}
