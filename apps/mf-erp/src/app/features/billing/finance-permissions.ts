export function canManageOrders(roles: readonly string[]): boolean {
  return roles.some(role => ['ADMIN', 'CAJERO', 'RECEPCIONISTA'].includes(role));
}
export function canCollectPayments(roles: readonly string[]): boolean {
  return roles.some(role => ['ADMIN', 'CAJERO'].includes(role));
}
