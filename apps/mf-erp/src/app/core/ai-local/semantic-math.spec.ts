import { classifyByKeywords, cosineSimilarity, rankByKeywordOverlap, rankBySimilarity } from './semantic-math';

describe('cosineSimilarity', () => {
  it('is 1 for identical directions', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('is 0 when a vector has no magnitude', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('rankBySimilarity', () => {
  const items = [
    { id: 'far', vector: [0, 1] },
    { id: 'close', vector: [1, 0.1] },
    { id: 'mid', vector: [1, 1] },
  ];

  it('orders items by descending similarity', () => {
    expect(rankBySimilarity([1, 0], items).map((r: { id: string }) => r.id)).toEqual(['close', 'mid', 'far']);
  });

  it('applies the minimum score and limit', () => {
    expect(rankBySimilarity([1, 0], items, { minScore: 0.5, limit: 1 }).map((r: { id: string }) => r.id)).toEqual(['close']);
  });
});

describe('rankByKeywordOverlap', () => {
  const items = [
    { id: 'exo', text: 'Exodoncia de Tercer Molar Retenido' },
    { id: 'res', text: 'Restauración Fotopolimerizable con Resina' },
    { id: 'lim', text: 'Limpieza dental (profilaxis)' },
  ];

  it('ranks items sharing words with the query, ignoring accents and case', () => {
    expect(rankByKeywordOverlap('restauracion resina', items).map((r: { id: string }) => r.id)).toEqual(['res']);
  });

  it('matches word prefixes', () => {
    expect(rankByKeywordOverlap('molar', items).map((r: { id: string }) => r.id)).toEqual(['exo']);
  });

  it('returns nothing for an empty query', () => {
    expect(rankByKeywordOverlap('  ', items)).toEqual([]);
  });
});

describe('classifyByKeywords', () => {
  it('detects basic services', () => {
    expect(classifyByKeywords('Pago factura de CRE electricidad de octubre')).toBe('SERVICIOS_BASICOS');
  });

  it('detects dental supplies, ignoring accents', () => {
    expect(classifyByKeywords('Compra de 5 cajas de lidocaína y agujas')).toBe('INSUMOS');
  });

  it('detects rent', () => {
    expect(classifyByKeywords('Alquiler del consultorio mes de octubre')).toBe('ALQUILER');
  });

  it('does not confuse short keywords with longer words', () => {
    expect(classifyByKeywords('Compra de gasas esteriles')).toBe('INSUMOS');
    expect(classifyByKeywords('Cuota de credito del equipo')).toBe('OTROS');
  });

  it('falls back to OTROS', () => {
    expect(classifyByKeywords('Almuerzo de cumpleaños del personal')).toBe('OTROS');
  });
});
