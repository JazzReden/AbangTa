import { z } from 'zod';
import Decimal from 'decimal.js';
import { normalizeGCashNumber, gcashReferenceKey } from '@/lib/utils/payment-details';

const validDate = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}, 'Enter a valid date');
const money = z.number().finite().nonnegative().max(99999999.99).refine(
  value => new Decimal(value).decimalPlaces() <= 2, 'Use at most two decimal places'
);

// ─────────────────────────────────────────────
// Auth Schemas
// ─────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  phone: z.string().optional(),
});

export const activateAccountSchema = z
  .object({
    token: z.string().min(1, 'Token is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ─────────────────────────────────────────────
// Property Schemas
// ─────────────────────────────────────────────

export const createPropertySchema = z.object({
  name: z
    .string()
    .min(2, 'Property name must be at least 2 characters')
    .max(200),
  address: z.string().min(5, 'Address must be at least 5 characters').max(500),
  description: z.string().max(2000).optional(),
  contactPhone: z.string().optional(),
  contactEmail: z
    .string()
    .email('Please enter a valid email')
    .optional()
    .or(z.literal('')),
});

export const updatePropertySchema = createPropertySchema.partial();

// ─────────────────────────────────────────────
// Room Schemas
// ─────────────────────────────────────────────

export const createRoomSchema = z.object({
  rentalMode: z.enum(['LEGACY_SHARED', 'WHOLE_ROOM', 'PER_BED']).optional(),
  roomNumber: z.string().min(1, 'Room number is required').max(20),
  description: z.string().max(1000).optional(),
  capacity: z.number().int().min(1, 'Capacity must be at least 1').max(20),
  monthlyRent: money.refine(value => value > 0, 'Monthly rent must be greater than 0'),
});

export const updateRoomSchema = createRoomSchema.partial();

export const updateRoomStatusSchema = z.object({
  status: z.enum(['VACANT', 'OCCUPIED', 'MAINTENANCE']),
});

// ─────────────────────────────────────────────
// Utility Config Schemas
// ─────────────────────────────────────────────

export const utilityConfigSchema = z
  .object({
    utilityType: z.enum(['WATER', 'ELECTRICITY']),
    billingMethod: z.enum(['INCLUDED', 'FIXED_RATE', 'METERED']),
    fixedAmount: z.number().positive().optional(),
    ratePerUnit: z.number().positive().optional(),
    unit: z.string().max(20).optional(),
    splitMethod: z.enum(['EQUAL_SPLIT', 'PER_ROOM']).default('EQUAL_SPLIT'),
  })
  .superRefine((data, ctx) => {
    if (data.billingMethod === 'FIXED_RATE' && !data.fixedAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Fixed amount is required for Fixed Rate billing',
        path: ['fixedAmount'],
      });
    }
    if (data.billingMethod === 'METERED' && !data.ratePerUnit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Rate per unit is required for Metered billing',
        path: ['ratePerUnit'],
      });
    }
    if (data.billingMethod === 'METERED' && !data.unit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unit is required for Metered billing (e.g. kWh, m³)',
        path: ['unit'],
      });
    }
  });

// ─────────────────────────────────────────────
// Tenant / Tenancy Schemas
// ─────────────────────────────────────────────

export const inviteTenantSchema = z.object({
  bedId: z.string().min(1).optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
  roomId: z.string().min(1, 'Room is required'),
  startDate: validDate,
  monthlyRent: money.refine(value => value > 0, 'Rent must be greater than zero'),
  securityDeposit: money.optional(),
  notes: z.string().max(1000).optional(),
});

// ─────────────────────────────────────────────
// Meter Reading Schemas
// ─────────────────────────────────────────────

export const meterReadingSchema = z
  .object({
    utilityConfigId: z.string().min(1),
    roomId: z.string().optional(),
    billingPeriodStart: validDate,
    billingPeriodEnd: validDate,
    previousReading: z.number().min(0, 'Previous reading cannot be negative'),
    currentReading: z.number().min(0, 'Current reading cannot be negative'),
    readingDate: validDate,
    isMeterReset: z.boolean().default(false),
    notes: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isMeterReset && data.currentReading < data.previousReading) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Current reading cannot be lower than the previous reading. If the meter was replaced, enable the Meter Reset option.',
        path: ['currentReading'],
      });
    }
  });

// ─────────────────────────────────────────────
// Bill Schemas
// ─────────────────────────────────────────────

export const generateBillSchema = z.object({
  tenancyId: z.string().min(1),
  billingPeriodStart: validDate,
  billingPeriodEnd: validDate,
  dueDate: validDate,
  waterMeterReadingId: z.string().optional(),
  electricityMeterReadingId: z.string().optional(),
  sharedWaterAmount: money.optional(),
  sharedElectricityAmount: money.optional(),
});

// ─────────────────────────────────────────────
// Payment Schemas
// ─────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  billId: z.string().min(1),
  amount: z
    .number()
    .positive('Payment amount must be greater than 0')
    .multipleOf(0.01),
  paymentDate: validDate,
  paymentMethod: z.enum(['CASH', 'GCASH', 'BANK_TRANSFER', 'OTHER']),
  referenceNumber: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
}).superRefine((data, ctx) => {
  if (data.paymentMethod === 'GCASH') {
    try { gcashReferenceKey('', data.referenceNumber ?? ''); }
    catch { ctx.addIssue({ code: 'custom', path: ['referenceNumber'], message: 'Enter a valid GCash transaction reference' }); }
  }
});

// ─────────────────────────────────────────────
// Maintenance Schemas
// ─────────────────────────────────────────────

export const createMaintenanceSchema = z.object({
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(200),
  description: z
    .string()
    .min(10, 'Please provide more detail (at least 10 characters)')
    .max(2000),
  category: z.enum(['PLUMBING', 'ELECTRICAL', 'WATER', 'ROOM', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
});

export const updateMaintenanceStatusSchema = z.object({
  status: z.enum([
    'SUBMITTED',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ]),
  statusNotes: z.string().max(1000).optional(),
});

// ─────────────────────────────────────────────
// Announcement Schemas
// ─────────────────────────────────────────────

export const createAnnouncementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(200),
  message: z
    .string()
    .trim()
    .min(10, 'Message must be at least 10 characters')
    .max(5000),
  expiresAt: validDate.optional(),
});

// ─────────────────────────────────────────────
// Profile & Settings Schemas
// ─────────────────────────────────────────────

export const updateLandlordProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
  businessName: z.string().max(150).optional(),
  bio: z.string().max(1000).optional(),
  officeAddress: z.string().max(300).optional(),
  taxIdNumber: z.string().max(50).optional(),
  gcashName: z.string().trim().max(100).optional(),
  gcashNumber: z.string().max(30).refine(value => {
    if (!value.trim()) return true;
    try { normalizeGCashNumber(value); return true; } catch { return false; }
  }, 'Enter a valid Philippine GCash mobile number').transform(value => value.trim() ? normalizeGCashNumber(value) : '').optional(),
  bankName: z.string().max(100).optional(),
  bankAccountName: z.string().max(100).optional(),
  bankAccountNumber: z.string().max(50).optional(),
}).refine(data => Boolean(data.gcashName) === Boolean(data.gcashNumber), {
  message: 'Provide both the GCash account name and mobile number, or leave both empty', path: ['gcashName'],
});

export const updateTenantProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
  occupation: z.string().max(100).optional(),
  companyOrSchool: z.string().max(150).optional(),
  permanentAddress: z.string().max(300).optional(),
  governmentIdType: z.string().max(50).optional(),
  governmentIdNum: z.string().max(50).optional(),
  emergencyContact: z.string().max(100).optional(),
  emergencyPhone: z.string().max(30).optional(),
  notes: z.string().max(1000).optional(),
});

// ─────────────────────────────────────────────
// Type exports
// ─────────────────────────────────────────────

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ActivateAccountInput = z.infer<typeof activateAccountSchema>;
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UtilityConfigInput = z.infer<typeof utilityConfigSchema>;
export type InviteTenantInput = z.infer<typeof inviteTenantSchema>;
export type MeterReadingFormInput = z.infer<typeof meterReadingSchema>;
export type GenerateBillInput = z.infer<typeof generateBillSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceStatusInput = z.infer<
  typeof updateMaintenanceStatusSchema
>;
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateLandlordProfileInput = z.infer<typeof updateLandlordProfileSchema>;
export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;
