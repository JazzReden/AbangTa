'use client';

import { useState } from 'react';
import { ActionError } from '@/components/ui/ActionError';

export function ProofImageInput({ maxBytes, className }: { maxBytes: number; className: string }) {
  const [error, setError] = useState('');
  return <div className="space-y-2">
    <label className="block">Payment screenshot (JPG or PNG, up to {maxBytes / 1024 / 1024} MB)
      <input className={className} name="proof" type="file" accept="image/jpeg,image/png" required onChange={event => {
        const file = event.currentTarget.files?.[0];
        const message = file && (file.size > maxBytes || !['image/jpeg', 'image/png'].includes(file.type))
          ? `Choose a JPG or PNG screenshot up to ${maxBytes / 1024 / 1024} MB.` : '';
        event.currentTarget.setCustomValidity(message);
        setError(message);
      }} />
    </label>
    <ActionError message={error} />
  </div>;
}
