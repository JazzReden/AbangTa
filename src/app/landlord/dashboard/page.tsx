import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { formatPeso } from '@/lib/utils/currency';
import {
  Building2,
  DoorOpen,
  Users,
  AlertCircle,
  Wrench,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';
import { PaymentProofService } from '@/services/billing/payment-proof.service';
import { PendingGCashProofs } from '@/components/billing/PendingGCashProofs';
import { DashboardProofRefresh } from '@/components/billing/DashboardProofRefresh';
import { pendingProofRevision } from '@/lib/security/payment-proof-revision';
import { AssistantRefreshSignal } from '@/components/assistant/LandlordAssistant';

export const metadata = { title: 'Dashboard' };

export default async function LandlordDashboardPage({ searchParams }: { searchParams: Promise<{ proofPage?: string }> }) {
  const user = await requireLandlord();
  const stats = await PropertyService.getDashboardStats(user.id);
  const { proofPage } = await searchParams;
  const pendingProofs = await PaymentProofService.getPendingForLandlord(user.id, /^\d{1,6}$/.test(proofPage ?? '') ? Number(proofPage) : 1);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const firstName = user.name.split(' ')[0];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <DashboardProofRefresh revision={pendingProofRevision(user.id, pendingProofs)} page={pendingProofs.page} />
      <AssistantRefreshSignal revision={JSON.stringify([stats.collectedThisMonth, stats.outstandingBalance, stats.openMaintenanceRequests, pendingProofs.total])} />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Your property overview.
        </p>
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-primary rounded-2xl p-5 text-primary-foreground">
          <p className="text-xs font-medium uppercase tracking-wider opacity-80 mb-1">
            Expected Rent
          </p>
          <p className="text-2xl font-bold">{formatPeso(stats.expectedMonthlyRent)}</p>
          <p className="text-xs opacity-70 mt-1">this month</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-border/50 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Collected
          </p>
          <p className="text-2xl font-bold text-green-600">
            {formatPeso(stats.collectedThisMonth)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">this month</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-border/50 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
            Outstanding
          </p>
          <p className="text-2xl font-bold text-destructive">
            {formatPeso(stats.outstandingBalance)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">balance due</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<Building2 size={18} />}
          label="Properties"
          value={stats.totalProperties}
          href="/landlord/properties"
          color="blue"
        />
        <StatCard
          icon={<DoorOpen size={18} />}
          label="Total Rooms"
          value={stats.totalRooms}
          href="/landlord/properties"
          color="purple"
        />
        <StatCard
          icon={<CheckCircle2 size={18} />}
          label="Occupied"
          value={stats.occupiedRooms}
          href="/landlord/properties"
          color="green"
        />
        <StatCard
          icon={<Users size={18} />}
          label="Tenants"
          value={stats.activeTenants}
          href="/landlord/properties"
          color="orange"
        />
      </div>

      <PendingGCashProofs queue={pendingProofs} />

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Maintenance */}
        <div className="bg-white rounded-2xl p-5 border border-border/50 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-orange-500" />
              <h2 className="font-semibold text-sm">Open Maintenance</h2>
            </div>
            <span className="bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {stats.openMaintenanceRequests} open
            </span>
          </div>

          {stats.openMaintenanceRequests === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open maintenance requests.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              You have {stats.openMaintenanceRequests} maintenance request
              {stats.openMaintenanceRequests !== 1 ? 's' : ''} that need attention.
            </p>
          )}

          <Link
            href="/landlord/properties"
            className="mt-4 text-sm text-primary font-medium hover:underline block"
          >
            View properties →
          </Link>
        </div>

        {/* Vacancies */}
        <div className="bg-white rounded-2xl p-5 border border-border/50 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={16} className="text-blue-500" />
            <h2 className="font-semibold text-sm">Vacant Rooms &amp; Beds</h2>
          </div>

          {stats.vacantRooms === 0 && stats.availableBeds === 0 ? (
            <p className="text-sm text-muted-foreground">All rooms are occupied!</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {stats.vacantRooms} room{stats.vacantRooms !== 1 ? 's' : ''} available. Invite
              tenants to fill them.
            </p>
          )}
          {stats.availableBeds > 0 && <p className="mt-2 text-sm text-muted-foreground">{stats.availableBeds} individual bed{stats.availableBeds === 1 ? '' : 's'} available.</p>}

          <Link
            href="/landlord/properties"
            className="mt-4 text-sm text-primary font-medium hover:underline block"
          >
            Manage rooms →
          </Link>
        </div>
      </div>

      {/* Add property CTA if none */}
      {stats.totalProperties === 0 && (
        <div className="mt-6 bg-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
          <Building2 size={32} className="text-primary mx-auto mb-2" />
          <h3 className="font-semibold text-foreground mb-1">Add your first property</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Start managing your boarding house by adding a property.
          </p>
          <Link
            href="/landlord/properties/new"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 font-semibold text-sm hover:bg-primary/90 transition"
          >
            Add Property
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  href,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
  color: 'blue' | 'purple' | 'green' | 'orange';
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <Link href={href}>
      <div className="bg-white rounded-2xl p-4 border border-border/50 shadow-sm hover:shadow-md transition cursor-pointer">
        <div className={`inline-flex rounded-xl p-2 mb-2 ${colorMap[color]}`}>{icon}</div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </Link>
  );
}
