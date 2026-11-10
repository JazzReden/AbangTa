import Decimal from 'decimal.js';

// Distribute whole centavos deterministically so the sum exactly equals the source charge.
export function allocateCents(total: Decimal.Value, ids: string[]) {
  const amount = new Decimal(total);
  if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2 || !ids.length) {
    throw new Error('Invalid shared utility amount or occupants');
  }
  const sorted = [...ids].sort();
  if (new Set(sorted).size !== sorted.length) throw new Error('Duplicate allocation participant');
  const cents = amount.mul(100);
  const base = cents.div(sorted.length).floor();
  const remainder = cents.mod(sorted.length).toNumber();
  return sorted.map((id, index) => ({
    id, amount: base.plus(index < remainder ? 1 : 0).div(100),
  }));
}

export function allocateRoomCharge(total: Decimal.Value, tenants: Array<{ id: string; roomId: string }>) {
  const rooms = [...new Set(tenants.map(t => t.roomId))];
  return allocateCents(total, rooms).flatMap(room =>
    allocateCents(room.amount, tenants.filter(t => t.roomId === room.id).map(t => t.id))
  );
}
