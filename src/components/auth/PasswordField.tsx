'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordField({ registering }: { registering: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div>
    <label htmlFor="account-password" className="mb-1.5 block text-sm font-medium">Password</label>
    <div className="relative">
      <input id="account-password" name="password" type={visible ? 'text' : 'password'}
        autoComplete={registering ? 'new-password' : 'current-password'} required
        minLength={registering ? 8 : 1} maxLength={72}
        placeholder={registering ? 'At least 8 characters' : 'Enter your password'}
        className="block min-h-12 w-full rounded-lg border border-input bg-white px-4 py-3 pr-12 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <button type="button" onClick={() => setVisible(value => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground">
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>;
}
