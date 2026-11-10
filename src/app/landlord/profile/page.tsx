import { requireLandlord } from '@/lib/auth/session';
import { GoogleConnection } from '@/components/auth/GoogleConnection';
import { prisma } from '@/lib/db/prisma';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { updateLandlordProfileAction } from './actions';
import {
  Building,
  CreditCard,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';

export const metadata = { title: 'Landlord Settings & Profile' };

export default async function LandlordProfilePage() {
  const sessionUser = await requireLandlord();

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: { landlordProfile: true },
  });

  if (!user) return null;

  const profile = user.landlordProfile;
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="mx-auto max-w-4xl p-4 pb-28 md:p-8">
      {/* Header Banner */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Account Management
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Host Profile & Payout Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your personal profile, boarding-house brand, and payment channels for tenants.
          </p>
        </div>
      </div>

      <GoogleConnection role="LANDLORD" connected={Boolean(user.googleSubject)} />
      {/* Hero Overview Card */}
      <div className="card-abangta mb-6 flex flex-col items-center gap-5 rounded-3xl p-6 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
          {initials}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h2 className="text-xl font-bold text-foreground">{user.name}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              <ShieldCheck size={13} />
              Verified Host
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {profile?.businessName || 'Independent Property Owner'}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground sm:justify-start">
            <span className="flex items-center gap-1">
              <Mail size={13} /> {user.email}
            </span>
            {user.phone && (
              <span className="flex items-center gap-1">
                <Phone size={13} /> {user.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      <StatefulForm
        action={updateLandlordProfileAction}
        className="space-y-6"
      >
        {/* Personal & Brand Information */}
        <section className="card-abangta rounded-3xl p-6">
          <div className="mb-4 flex items-center gap-2 border-b border-border/50 pb-3">
            <User size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">Personal & Business Identity</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Display Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={user.name}
                required
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. Juan dela Cruz"
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Primary Contact Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={user.phone ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. +63 917 123 4567"
              />
            </div>

            <div>
              <label htmlFor="businessName" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Boarding House / Business Name
              </label>
              <input
                id="businessName"
                name="businessName"
                type="text"
                defaultValue={profile?.businessName ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. AbangTa Residences Cebu"
              />
            </div>

            <div>
              <label htmlFor="taxIdNumber" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                TIN / Business Registration # <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <input
                id="taxIdNumber"
                name="taxIdNumber"
                type="text"
                defaultValue={profile?.taxIdNumber ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. 123-456-789-000"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="officeAddress" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Office / Landlord Main Address
              </label>
              <input
                id="officeAddress"
                name="officeAddress"
                type="text"
                defaultValue={profile?.officeAddress ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. 123 Colon St., Cebu City, Philippines"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="bio" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                About / Property Manager Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                rows={3}
                defaultValue={profile?.bio ?? ''}
                className="w-full resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="Write a friendly note to your tenants or describe your boarding-house community..."
              />
            </div>
          </div>
        </section>

        {/* Tenant Payout & Remittance Channels */}
        <section className="card-abangta rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-primary" />
              <h2 className="text-base font-bold text-foreground">Rent Payment Accounts</h2>
            </div>
            <span className="text-xs text-muted-foreground">Shown to tenants on monthly bills</span>
          </div>

          <div className="space-y-5">
            {/* GCash Channel */}
            <div className="rounded-2xl bg-background p-4 border border-border/60">
              <div className="mb-3 flex items-center gap-2 text-primary font-semibold text-sm">
                <Smartphone size={16} />
                <span>GCash Payment Details</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="gcashName" className="mb-1 block text-xs font-medium text-muted-foreground">
                    Account Registered Name
                  </label>
                  <input
                    id="gcashName"
                    name="gcashName"
                    type="text"
                    defaultValue={profile?.gcashName ?? ''}
                    className="w-full rounded-xl border border-input bg-white px-3.5 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring/20"
                    placeholder="e.g. JUAN DELA CRUZ"
                  />
                </div>
                <div>
                  <label htmlFor="gcashNumber" className="mb-1 block text-xs font-medium text-muted-foreground">
                    GCash Mobile Number
                  </label>
                  <input
                    id="gcashNumber"
                    name="gcashNumber"
                    type="tel"
                    defaultValue={profile?.gcashNumber ?? ''}
                    className="w-full rounded-xl border border-input bg-white px-3.5 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring/20"
                    placeholder="e.g. 09171234567"
                  />
                </div>
              </div>
            </div>

            {/* Traditional Bank Account */}
            <div className="rounded-2xl bg-background p-4 border border-border/60">
              <div className="mb-3 flex items-center gap-2 text-primary font-semibold text-sm">
                <Building size={16} />
                <span>Bank Deposit / Online Transfer</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="bankName" className="mb-1 block text-xs font-medium text-muted-foreground">
                    Bank Name
                  </label>
                  <input
                    id="bankName"
                    name="bankName"
                    type="text"
                    defaultValue={profile?.bankName ?? ''}
                    className="w-full rounded-xl border border-input bg-white px-3.5 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring/20"
                    placeholder="e.g. BDO / BPI / UnionBank"
                  />
                </div>
                <div>
                  <label htmlFor="bankAccountName" className="mb-1 block text-xs font-medium text-muted-foreground">
                    Account Name
                  </label>
                  <input
                    id="bankAccountName"
                    name="bankAccountName"
                    type="text"
                    defaultValue={profile?.bankAccountName ?? ''}
                    className="w-full rounded-xl border border-input bg-white px-3.5 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring/20"
                    placeholder="e.g. Juan D. Cruz"
                  />
                </div>
                <div>
                  <label htmlFor="bankAccountNumber" className="mb-1 block text-xs font-medium text-muted-foreground">
                    Account Number
                  </label>
                  <input
                    id="bankAccountNumber"
                    name="bankAccountNumber"
                    type="text"
                    defaultValue={profile?.bankAccountNumber ?? ''}
                    className="w-full rounded-xl border border-input bg-white px-3.5 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring/20"
                    placeholder="e.g. 0012-3456-7890"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Action Button */}
        <div className="flex justify-end">
          <SubmitButton className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50">
            Save Settings & Profile
          </SubmitButton>
        </div>
      </StatefulForm>
    </div>
  );
}
