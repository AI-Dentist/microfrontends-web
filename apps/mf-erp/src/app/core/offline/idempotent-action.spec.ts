import { IdempotentAction } from './idempotent-action';

function sequence() {
  let n = 0;
  return () => `key-${++n}`;
}
const cashCharge = (razonSocialCliente = 'Perez') => ({ input: {
  cuotaId: 'c1', usuarioCajeroId: 'a1000000-0000-0000-0000-000000000001', ciNitCliente: '123', razonSocialCliente,
} });

describe('IdempotentAction', () => {
  it('reuses the same key while the payload does not change (double click, retry)', () => {
    const action = new IdempotentAction(sequence());
    expect(action.keyFor(cashCharge())).toBe('key-1');
    expect(action.keyFor(cashCharge())).toBe('key-1');
  });

  it('ignores property order when comparing payloads', () => {
    const action = new IdempotentAction(sequence());
    action.keyFor({ input: { a: 1, b: 2 } });
    expect(action.keyFor({ input: { b: 2, a: 1 } })).toBe('key-1');
  });

  it('issues a new key when the user edits the payload after a rejected attempt', () => {
    const action = new IdempotentAction(sequence());
    action.keyFor(cashCharge());
    expect(action.keyFor(cashCharge('Pérez SRL'))).toBe('key-2');
  });

  it('starts over after reset', () => {
    const action = new IdempotentAction(sequence());
    action.keyFor({ input: 1 });
    action.reset();
    expect(action.keyFor({ input: 1 })).toBe('key-2');
  });
});
