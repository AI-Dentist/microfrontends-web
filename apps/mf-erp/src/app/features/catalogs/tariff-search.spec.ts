import { describe, expect, it } from 'vitest';
import { buildTariffSearchItems, mapRankedServices } from './tariff-search';

const services = [
  { id: '1', codigo: 'EXO-03', nombre: 'Exodoncia de Tercer Molar Retenido', descripcion: 'Extracción quirúrgica', precioBaseBs: 450, especialidad: null, activo: true },
  { id: '2', codigo: 'LIM-01', nombre: 'Limpieza dental', descripcion: null, precioBaseBs: 150, especialidad: null, activo: true },
];

describe('buildTariffSearchItems', () => {
  it('joins nombre and descripcion and tolerates a missing description', () => {
    expect(buildTariffSearchItems(services)).toEqual([
      { id: '1', text: 'Exodoncia de Tercer Molar Retenido Extracción quirúrgica' },
      { id: '2', text: 'Limpieza dental' },
    ]);
  });
});

describe('mapRankedServices', () => {
  it('keeps ranking order, attaches scores and drops unknown ids', () => {
    const result = mapRankedServices(
      [{ id: '2', score: 0.8 }, { id: '99', score: 0.7 }, { id: '1', score: 0.5 }],
      services,
    );
    expect(result.map((r) => [r.service.id, r.score])).toEqual([['2', 0.8], ['1', 0.5]]);
  });
});
