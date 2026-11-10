import { requireTenant } from '@/lib/auth/session';
import { GoogleConnection } from '@/components/auth/GoogleConnection';
import { prisma } from '@/lib/db/prisma';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { updateTenantProfileAction } from './actions';
import {
  DoorOpen,
  FileBadge,
  HeartHandshake,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { formatPeso } from '@/lib/utils/currency';

export const metadata = { title: 'Tenant Profile & Verification' };

export default async function TenantProfilePage() {
  const sessionUser = await requireTenant();

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: {
      tenantProfile: true,
      tenancies: {
        where: { status: 'ACTIVE' },
        include: {
          room: true,
          property: true,
        },
      },
    },
  });

  if (!user) return null;

  const profile = user.tenantProfile;
  const activeTenancy = user.tenancies[0];
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="mx-auto max-w-4xl p-4 pb-28 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Tenant Portal
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Guest Profile & Verification
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Keep your resident identity, contact information, and emergency contacts up to date.
        </p>
      </div>

      <GoogleConnection role="TENANT" connected={Boolean(user.googleSubject)} />
      {/* Hotel / Stay Card Summary */}
      {activeTenancy && (
        <div className="mb-6 rounded-3xl bg-foreground p-6 text-background shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-primary">
                <DoorOpen size={24} className="text-primary" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-background/70">
                  Current Room Stay
                </span>
                <h3 className="text-xl font-bold text-background">
                  Room {activeTenancy.room.roomNumber} · {activeTenancy.property.name}
                </h3>
                <p className="text-xs text-background/70">{activeTenancy.property.address}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-3 sm:border-t-0 sm:pt-0">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-background/70">Monthly Rent</p>
                <p className="text-base font-bold text-background">
                  {formatPeso(activeTenancy.monthlyRent)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-background/70">Since</p>
                <p className="text-xs font-semibold text-background">
                  {new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' }).format(
                    activeTenancy.startDate
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resident Identity Banner */}
      <div className="card-abangta mb-6 flex flex-col items-center gap-5 rounded-3xl p-6 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
          {initials}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h2 className="text-xl font-bold text-foreground">{user.name}</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
              <ShieldCheck size={13} />
              Registered Resident
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {profile?.occupation ? `${profile.occupation}` : 'Resident'}{' '}
            {profile?.companyOrSchool ? `at ${profile.companyOrSchool}` : ''}
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

      <StatefulForm action={updateTenantProfileAction} className="space-y-6">
        {/* Basic Contact Info */}
        <section className="card-abangta rounded-3xl p-6">
          <div className="mb-4 flex items-center gap-2 border-b border-border/50 pb-3">
            <User size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">Personal Information</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={user.name}
                required
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="Juan dela Cruz"
              />
            </div>

            <div>
              <label htmlFor="phone" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Mobile Number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={user.phone ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="09XX XXX XXXX"
              />
            </div>

            <div>
              <label htmlFor="occupation" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Occupation / Field
              </label>
              <input
                id="occupation"
                name="occupation"
                type="text"
                defaultValue={profile?.occupation ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. Software Engineer / Student / Nurse"
              />
            </div>

            <div>
              <label htmlFor="companyOrSchool" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Employer / University
              </label>
              <input
                id="companyOrSchool"
                name="companyOrSchool"
                type="text"
                defaultValue={profile?.companyOrSchool ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. University of San Carlos / Tech Co."
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="permanentAddress" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Permanent Hometown Address
              </label>
              <input
                id="permanentAddress"
                name="permanentAddress"
                type="text"
                defaultValue={profile?.permanentAddress ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. Brgy. Poblacion, Ormoc City, Leyte"
              />
            </div>
          </div>
        </section>

        {/* Verification & Government ID */}
        <section className="card-abangta rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-2">
              <FileBadge size={18} className="text-primary" />
              <h2 className="text-base font-bold text-foreground">Identity & KYC Verification</h2>
            </div>
            <span className="text-xs text-muted-foreground">Kept private with your host</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="governmentIdType" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Government ID Type
              </label>
              <select
                id="governmentIdType"
                name="governmentIdType"
                defaultValue={profile?.governmentIdType ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
              >
                <option value="">Select ID Type</option>
                <option value="Philippine Passport">Philippine Passport</option>
                <option value="PhilSys National ID">PhilSys National ID</option>
                <option value="Driver's License">Driver&apos;s License</option>
                <option value="UMID / SSS">UMID / SSS ID</option>
                <option value="PRC ID">PRC License</option>
                <option value="Voter's ID">Voter&apos;s ID</option>
                <option value="Student ID">Student ID</option>
                <option value="Other">Other Valid Government ID</option>
              </select>
            </div>

            <div>
              <label htmlFor="governmentIdNum" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                ID / Reference Number
              </label>
              <input
                id="governmentIdNum"
                name="governmentIdNum"
                type="text"
                defaultValue={profile?.governmentIdNum ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. 1234-5678-9012"
              />
            </div>
          </div>
        </section>

        {/* Emergency Contact */}
        <section className="card-abangta rounded-3xl p-6">
          <div className="mb-4 flex items-center gap-2 border-b border-border/50 pb-3">
            <HeartHandshake size={18} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">Emergency Contact</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="emergencyContact" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Contact Person & Relationship
              </label>
              <input
                id="emergencyContact"
                name="emergencyContact"
                type="text"
                defaultValue={profile?.emergencyContact ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. Maria dela Cruz (Mother)"
              />
            </div>

            <div>
              <label htmlFor="emergencyPhone" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Emergency Mobile Number
              </label>
              <input
                id="emergencyPhone"
                name="emergencyPhone"
                type="tel"
                defaultValue={profile?.emergencyPhone ?? ''}
                className="w-full rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="09XX XXX XXXX"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="notes" className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Special Requests or Medical Notes <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                defaultValue={profile?.notes ?? ''}
                className="w-full resize-none rounded-2xl border border-input bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20"
                placeholder="Allergies, expected curfew arrangements, or special room requests..."
              />
            </div>
          </div>
        </section>

        {/* Save CTA */}
        <div className="flex justify-end">
          <SubmitButton className="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-50">
            Save Resident Profile
          </SubmitButton>
        </div>
      </StatefulForm>
    </div>
  );
}
