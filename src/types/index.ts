import type {
  User,
  Property,
  Room,
  Tenancy,
  Bill,
  BillItem,
  Payment,
  UtilityConfig,
  MeterReading,
  MaintenanceRequest,
  Announcement,
  Notification,
  LandlordProfile,
  TenantProfile,
} from '@prisma/client';

export type {
  User,
  Property,
  Room,
  Tenancy,
  Bill,
  BillItem,
  Payment,
  UtilityConfig,
  MeterReading,
  MaintenanceRequest,
  Announcement,
  Notification,
  LandlordProfile,
  TenantProfile,
};

// ─────────────────────────────────────────────
// Session / Auth
// ─────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'LANDLORD' | 'TENANT';
  avatarUrl?: string | null;
}

// ─────────────────────────────────────────────
// API Response wrappers
// ─────────────────────────────────────────────

export interface ApiResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ServerActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// ─────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────

export interface LandlordDashboardStats {
  totalProperties: number;
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  activeTenants: number;
  expectedMonthlyRent: number;
  collectedThisMonth: number;
  outstandingBalance: number;
  openMaintenanceRequests: number;
}

// ─────────────────────────────────────────────
// Composite types with relations
// ─────────────────────────────────────────────

export interface BillWithItems extends Bill {
  items: BillItem[];
  payments: Payment[];
  tenancy: Tenancy & {
    tenant: Pick<User, 'id' | 'name' | 'email'>;
    room: Pick<Room, 'id' | 'roomNumber'>;
  };
}

export interface PropertyWithStats extends Property {
  rooms: Room[];
  occupiedRooms: number;
  vacantRooms: number;
  activeTenants: number;
  monthlyRevenue: number;
}

export interface RoomWithTenancy extends Room {
  tenancies: Array<
    Tenancy & {
      tenant: Pick<User, 'id' | 'name' | 'email' | 'phone'>;
    }
  >;
}

export interface TenancyWithDetails extends Tenancy {
  tenant: User & { tenantProfile: TenantProfile | null };
  room: Room;
  property: Property;
  bills: Bill[];
}

// ─────────────────────────────────────────────
// Billing input types
// ─────────────────────────────────────────────

export interface BillGenerationInput {
  applyAdvance?: boolean;
  additionalCharges?: import('@/lib/utils/additional-charges').AdditionalCharge[];
  tenancyId: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  dueDate: Date;
  waterMeterReadingId?: string;
  electricityMeterReadingId?: string;
  sharedWaterAmount?: number;
  sharedElectricityAmount?: number;
  createdById: string;
}

export interface PaymentInput {
  idempotencyKey?: string;
  billId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'OTHER';
  referenceNumber?: string;
  notes?: string;
  recordedById: string;
}

export interface MeterReadingInput {
  utilityConfigId: string;
  propertyId: string;
  roomId?: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  previousReading: number;
  currentReading: number;
  readingDate: Date;
  isMeterReset?: boolean;
  notes?: string;
  createdById: string;
}
