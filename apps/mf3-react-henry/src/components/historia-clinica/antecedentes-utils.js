/**
 * Valida las reglas de invariantes clínicas sobre antecedentes.
 * Regla: todo antecedente en estado CONFIRMADO debe poseer un detalle no vacío.
 *
 * @param {object} antecedentes
 * @returns {string[]} Lista de mensajes de error de validación
 */
export function validateAntecedentes(antecedentes) {
  const errors = [];

  if (!antecedentes) return errors;

  // 1. Odontológicos
  const odonto = antecedentes.antecedentesOdontologicos || {};
  for (const [key, campo] of Object.entries(odonto)) {
    if (campo?.estado === 'CONFIRMADO' && (!campo.detalle || !campo.detalle.trim())) {
      errors.push(`El antecedente odontológico '${key}' está CONFIRMADO pero carece de detalle clínico explicativo.`);
    }
  }

  // 2. Arrays
  const checkArray = (arr, nombreCategoria) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((item, idx) => {
      if (item.estado === 'CONFIRMADO' && (!item.detalle || !item.detalle.trim())) {
        const itemNom = item.nombre?.trim() || `Elemento ${idx + 1}`;
        errors.push(`En '${nombreCategoria}', '${itemNom}' está marcado como CONFIRMADO pero no tiene detalle.`);
      }
      if (!item.nombre || !item.nombre.trim()) {
        errors.push(`En '${nombreCategoria}', el elemento ${idx + 1} requiere un nombre o descripción de la condición.`);
      }
    });
  };

  checkArray(antecedentes.enfermedadesCronicas, 'Enfermedades Crónicas');
  checkArray(antecedentes.antecedentesMedicos, 'Antecedentes Médicos');
  checkArray(antecedentes.antecedentesFamiliares, 'Antecedentes Familiares');

  return errors;
}

/**
 * Limpia y normaliza los antecedentes para enviarlos al backend en el formato exacto de AntecedentesHttpDto.
 *
 * @param {object} antecedentes
 * @returns {object} AntecedentesHttpDto limpio
 */
export function serializeAntecedentes(antecedentes) {
  if (!antecedentes) {
    return {
      enfermedadesCronicas: [],
      antecedentesMedicos: [],
      antecedentesFamiliares: [],
      antecedentesOdontologicos: {},
    };
  }

  const cleanArray = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((item) => item && item.nombre && item.nombre.trim())
      .map((item) => ({
        nombre: item.nombre.trim(),
        estado: item.estado || 'NO_EVALUADO',
        detalle: item.detalle?.trim() || null,
        registradoEn: item.registradoEn || new Date().toISOString(),
      }));
  };

  const cleanOdonto = {};
  const odonto = antecedentes.antecedentesOdontologicos || {};
  for (const [key, campo] of Object.entries(odonto)) {
    if (campo && campo.estado) {
      cleanOdonto[key] = {
        estado: campo.estado,
        detalle: campo.detalle?.trim() || null,
        registradoEn: campo.registradoEn || new Date().toISOString(),
      };
    }
  }

  return {
    enfermedadesCronicas: cleanArray(antecedentes.enfermedadesCronicas),
    antecedentesMedicos: cleanArray(antecedentes.antecedentesMedicos),
    antecedentesFamiliares: cleanArray(antecedentes.antecedentesFamiliares),
    antecedentesOdontologicos: cleanOdonto,
  };
}
