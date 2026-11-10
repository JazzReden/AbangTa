'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AdditionalCharge } from '@/lib/utils/additional-charges';

type Row = Omit<AdditionalCharge, 'amount' | 'treatment'> & { id: number; treatment: AdditionalCharge['treatment'] | ''; amount: string };
const inputClass = 'w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm';

export function AdditionalCharges({ initialCharges = [], allowCustom = true, legend = 'Additional charges', parkingLocked = false }: {
  initialCharges?: AdditionalCharge[]; allowCustom?: boolean; legend?: string; parkingLocked?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const standard: Row[] = (['WIFI', 'PARKING'] as const).map((itemType, id) => {
      const saved = initialCharges.find(charge => charge.itemType === itemType);
      return { id, itemType, description: itemType === 'WIFI' ? 'Wi-Fi' : 'Parking',
        treatment: saved?.treatment ?? '', amount: saved ? String(saved.amount) : '' };
    });
    return [...standard, ...(allowCustom ? initialCharges.filter(charge => charge.itemType === 'OTHER').map((charge, index) => ({
      ...charge, id: index + 2, amount: String(charge.amount),
    })) : [])];
  });
  const [nextId, setNextId] = useState(() => 2 + initialCharges.filter(charge => charge.itemType === 'OTHER').length);
  function update(id: number, patch: Partial<Row>) {
    setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  }
  const charges = rows.filter(row => row.treatment).map(row => ({
    itemType: row.itemType, description: row.description, treatment: row.treatment,
    amount: row.treatment === 'ADDITIONAL' ? Number(row.amount) : 0,
  }));
  return <fieldset id="additional-charges" className="scroll-mt-24 space-y-4 border-t border-border pt-4">
    <legend className="px-1 text-sm font-semibold">{legend}</legend>
    <input type="hidden" name="additionalCharges" value={JSON.stringify(charges)} />
    {rows.map(row => <div key={row.id} className="space-y-2">
      <div className="flex items-center gap-2">
        {row.itemType === 'OTHER' ? <input aria-label="Charge name" placeholder="Charge name" value={row.description} maxLength={100} minLength={2} required={Boolean(row.treatment)} onChange={event => update(row.id, { description: event.target.value })} className={inputClass} /> : <span className="text-sm font-medium">{row.description}</span>}
        {row.itemType === 'OTHER' && <button type="button" title="Remove charge" aria-label="Remove charge" className="shrink-0 rounded-lg border p-2" onClick={() => setRows(current => current.filter(item => item.id !== row.id))}><Trash2 size={18} /></button>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label={`${row.description || 'Custom charge'} billing`} value={row.treatment} disabled={row.itemType === 'PARKING' && parkingLocked} onChange={event => update(row.id, { treatment: event.target.value as Row['treatment'] })} className={inputClass}>
          <option value="">Not applicable</option><option value="ADDITIONAL">Charge separately</option><option value="INCLUDED">Included in rent</option><option value="FREE">Free</option>
        </select>
        {row.treatment === 'ADDITIONAL' && <input aria-label={`${row.description || 'Custom charge'} amount`} type="number" min="0.01" max="99999999.99" step="0.01" required value={row.amount} onChange={event => update(row.id, { amount: event.target.value })} placeholder="Amount (PHP)" className={inputClass} />}
      </div>
    </div>)}
    {allowCustom && <button type="button" disabled={rows.length >= 20} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => {
      setRows(current => [...current, { id: nextId, itemType: 'OTHER', description: '', treatment: 'ADDITIONAL', amount: '' }]);
      setNextId(current => current + 1);
    }}><Plus size={16} />Add charge</button>}
  </fieldset>;
}
