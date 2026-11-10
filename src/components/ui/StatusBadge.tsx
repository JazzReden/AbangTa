import { cn } from '@/lib/utils';
import type { RoomStatus, BillStatus, TenancyStatus, MaintenanceStatus, MaintenancePriority } from '@prisma/client';

// ─── Room Status ─────────────────────────────

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const map: Record<RoomStatus, { label: string; className: string }> = {
    VACANT: { label: 'Vacant', className: 'badge-vacant' },
    OCCUPIED: { label: 'Occupied', className: 'badge-occupied' },
    MAINTENANCE: { label: 'Maintenance', className: 'badge-maintenance' },
  };
  const { label, className } = map[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  );
}

// ─── Bill Status ─────────────────────────────

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const map: Record<BillStatus, { label: string; className: string }> = {
    PENDING: { label: 'Pending', className: 'badge-pending' },
    PARTIALLY_PAID: { label: 'Partial', className: 'badge-partial' },
    PAID: { label: 'Paid', className: 'badge-paid' },
    OVERDUE: { label: 'Overdue', className: 'badge-overdue' },
    CANCELLED: { label: 'Cancelled', className: 'badge-cancelled' },
  };
  const { label, className } = map[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  );
}

// ─── Tenancy Status ──────────────────────────

export function TenancyStatusBadge({ status }: { status: TenancyStatus }) {
  const map: Record<TenancyStatus, { label: string; className: string }> = {
    PENDING: { label: 'Pending', className: 'badge-pending' },
    ACTIVE: { label: 'Active', className: 'badge-occupied' },
    ENDED: { label: 'Ended', className: 'badge-cancelled' },
  };
  const { label, className } = map[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  );
}

// ─── Maintenance Status ──────────────────────

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const map: Record<MaintenanceStatus, { label: string; className: string }> = {
    SUBMITTED: { label: 'Submitted', className: 'badge-pending' },
    ACKNOWLEDGED: { label: 'Acknowledged', className: 'badge-partial' },
    IN_PROGRESS: { label: 'In Progress', className: 'badge-partial' },
    COMPLETED: { label: 'Completed', className: 'badge-paid' },
    CANCELLED: { label: 'Cancelled', className: 'badge-cancelled' },
  };
  const { label, className } = map[status];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  );
}

// ─── Priority Badge ──────────────────────────

export function PriorityBadge({ priority }: { priority: MaintenancePriority }) {
  const map: Record<MaintenancePriority, { label: string; className: string }> = {
    LOW: { label: 'Low', className: 'badge-cancelled' },
    MEDIUM: { label: 'Medium', className: 'badge-pending' },
    HIGH: { label: 'High', className: 'badge-partial' },
    URGENT: { label: 'Urgent', className: 'badge-overdue' },
  };
  const { label, className } = map[priority];
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', className)}>
      {label}
    </span>
  );
}
