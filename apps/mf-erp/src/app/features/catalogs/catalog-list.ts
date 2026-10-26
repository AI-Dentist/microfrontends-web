/** Pure list helpers shared by the catalog screens. */
export function removeById<T extends { id: string }>(rows: readonly T[], id: string): T[] {
  return rows.filter((row) => row.id !== id);
}

/** Replaces the row with the same id in place, or appends it when it is new. */
export function upsertById<T extends { id: string }>(rows: readonly T[], item: T): T[] {
  return rows.some((row) => row.id === item.id) ? rows.map((row) => (row.id === item.id ? item : row)) : [...rows, item];
}

/** Real MS1 role codes assignable by an administrator. */
export const CLINIC_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'CAJERO', label: 'Cajero' },
  { value: 'RECEPCIONISTA', label: 'Recepción' },
  { value: 'ODONTOLOGO', label: 'Odontólogo' },
];
