import { CLINIC_ROLE_OPTIONS, removeById, upsertById } from './catalog-list';

describe('removeById', () => {
  it('drops only the row with the given id', () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    expect(removeById(rows, '2')).toEqual([{ id: '1' }, { id: '3' }]);
  });

  it('returns an equal list when the id is unknown and never mutates the input', () => {
    const rows = [{ id: '1' }];
    const result = removeById(rows, '9');
    expect(result).toEqual([{ id: '1' }]);
    expect(rows).toEqual([{ id: '1' }]);
  });
});

describe('upsertById', () => {
  it('replaces a row with the same id keeping its position', () => {
    const rows = [{ id: '1', n: 'a' }, { id: '2', n: 'b' }];
    expect(upsertById(rows, { id: '1', n: 'z' })).toEqual([{ id: '1', n: 'z' }, { id: '2', n: 'b' }]);
  });

  it('appends a row with a new id', () => {
    expect(upsertById([{ id: '1' }], { id: '2' })).toEqual([{ id: '1' }, { id: '2' }]);
  });
});

describe('CLINIC_ROLE_OPTIONS', () => {
  it('offers exactly the four clinic roles', () => {
    expect(CLINIC_ROLE_OPTIONS.map((option) => option.value)).toEqual(['ADMIN', 'CAJERO', 'RECEPCIONISTA', 'ODONTOLOGO']);
  });
});
