import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { archivePropertyAction, updatePropertyAction } from '@/app/landlord/properties/actions';

export const metadata = { title: 'Edit Property' };

export default async function EditPropertyPage({ params: paramsPromise }: {
  params: Promise<{ propertyId: string }>;
}) {
  const params = await paramsPromise;
  const user = await requireLandlord();
  const property = await PropertyService.getPropertyDetail(params.propertyId, user.id);
  if (!property) notFound();

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <Link
        href={`/landlord/properties/${property.id}`}
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft size={16} />
        Back to property
      </Link>
      <h1 className="mb-5 text-2xl font-bold">Edit property</h1>
      <StatefulForm
        action={updatePropertyAction.bind(null, property.id)}
        className="card-abangta space-y-4 rounded-3xl p-5"
      >
        <Field label="Property name" name="name" defaultValue={property.name} required />
        <Field label="Address" name="address" defaultValue={property.address} required />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Description</span>
          <textarea
            name="description"
            defaultValue={property.description ?? ''}
            rows={4}
            className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm"
          />
        </label>
        <Field label="Contact phone" name="contactPhone" defaultValue={property.contactPhone ?? ''} />
        <Field label="Contact email" name="contactEmail" defaultValue={property.contactEmail ?? ''} />
        <SubmitButton className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
          Save changes
        </SubmitButton>
      </StatefulForm>

      <form action={archivePropertyAction.bind(null, property.id)} className="mt-6">
        <div className="dark-sheet">
          <p className="text-sm uppercase tracking-wide text-white/70">Archive</p>
          <h2 className="mt-1 text-lg font-semibold">Archive this property</h2>
          <p className="mt-2 text-sm text-white/70">
            Properties with financial history are archived, not deleted. Active tenants must be ended first.
          </p>
          <button className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-900">
            Confirm archive
          </button>
        </div>
      </form>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...input } = props;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input {...input} className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm" />
    </label>
  );
}
