import { EXPENSE_CATEGORIES, classifyByKeywords } from './semantic-math';
import { EXPENSE_LABELS } from './local-ai.protocol';
it('offers all five expense labels to the local classifier and preserves existing categories', () => {
  expect([...EXPENSE_CATEGORIES].sort()).toEqual(['ALQUILER', 'INSUMOS', 'MANTENIMIENTO', 'OTROS', 'SERVICIOS_BASICOS']);
  expect(EXPENSE_LABELS).toHaveProperty('MANTENIMIENTO');
  expect(classifyByKeywords('mantenimiento del sillón')).toBe('MANTENIMIENTO');
  expect(classifyByKeywords('Guantes')).toBe('INSUMOS');
});
