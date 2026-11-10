import Link from 'next/link';
import { ArrowLeft, Building2 } from 'lucide-react';
import { createPropertyAction } from '../actions';

export const metadata = { title: 'Add Property' };

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link
        href="/landlord/properties"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} />
        Properties
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
          <Building2 size={22} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            New property
          </p>
          <h1 className="text-2xl font-bold">Add a boarding house</h1>
        </div>
      </div>

      <form action={createPropertyAction} className="card-abangta space-y-4 rounded-3xl p-5">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            Property name
          </label>
          <input
            id="name"
            name="name"
            required
            minLength={2}
            className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="AbangTa Boarding House"
          />
        </div>

        <div>
          <label htmlFor="address" className="mb-1.5 block text-sm font-medium">
            Address
          </label>
          <input
            id="address"
            name="address"
            required
            minLength={5}
            className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Cebu City, Philippines"
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Short notes about the property."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="contactPhone" className="mb-1.5 block text-sm font-medium">
              Contact phone
            </label>
            <input
              id="contactPhone"
              name="contactPhone"
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="+63 900 000 0000"
            />
          </div>
          <div>
            <label htmlFor="contactEmail" className="mb-1.5 block text-sm font-medium">
              Contact email
            </label>
            <input
              id="contactEmail"
              name="contactEmail"
              type="email"
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="hello@example.com"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Create Property
        </button>
      </form>
    </div>
  );
}
