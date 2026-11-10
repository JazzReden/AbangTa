import { prisma } from '@/lib/db/prisma';

/**
 * Assert that a landlord owns a specific property.
 * Throws an error if the landlord does not own the property.
 */
export async function assertLandlordOwnsProperty(
  landlordId: string,
  propertyId: string
): Promise<void> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { landlordId: true, archivedAt: true },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  if (property.landlordId !== landlordId) {
    throw new Error('FORBIDDEN: This property does not belong to your account');
  }
}

/**
 * Assert that a landlord owns the property that contains the given room.
 */
export async function assertLandlordOwnsRoom(
  landlordId: string,
  roomId: string
): Promise<void> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: {
      property: {
        select: { landlordId: true },
      },
    },
  });

  if (!room) {
    throw new Error('Room not found');
  }

  if (room.property.landlordId !== landlordId) {
    throw new Error('FORBIDDEN: This room does not belong to your property');
  }
}

/**
 * Assert that a landlord owns the property for a given tenancy.
 */
export async function assertLandlordOwnsTenancy(
  landlordId: string,
  tenancyId: string
): Promise<void> {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    select: {
      property: {
        select: { landlordId: true },
      },
    },
  });

  if (!tenancy) {
    throw new Error('Tenancy not found');
  }

  if (tenancy.property.landlordId !== landlordId) {
    throw new Error('FORBIDDEN: This tenancy does not belong to your property');
  }
}

/**
 * Assert that a landlord owns the property for a given bill.
 */
export async function assertLandlordOwnsBill(
  landlordId: string,
  billId: string
): Promise<void> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    select: {
      property: {
        select: { landlordId: true },
      },
    },
  });

  if (!bill) {
    throw new Error('Bill not found');
  }

  if (bill.property.landlordId !== landlordId) {
    throw new Error('FORBIDDEN: This bill does not belong to your property');
  }
}

/**
 * Assert that a tenant is associated with a specific tenancy.
 */
export async function assertTenantOwnsTenancy(
  tenantId: string,
  tenancyId: string
): Promise<void> {
  const tenancy = await prisma.tenancy.findUnique({
    where: { id: tenancyId },
    select: { tenantId: true },
  });

  if (!tenancy) {
    throw new Error('Tenancy not found');
  }

  if (tenancy.tenantId !== tenantId) {
    throw new Error('FORBIDDEN: You do not have access to this record');
  }
}

/**
 * Assert that a tenant is associated with a specific bill.
 */
export async function assertTenantOwnsBill(
  tenantId: string,
  billId: string
): Promise<void> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    select: {
      tenancy: {
        select: { tenantId: true },
      },
    },
  });

  if (!bill) {
    throw new Error('Bill not found');
  }

  if (bill.tenancy.tenantId !== tenantId) {
    throw new Error('FORBIDDEN: You do not have access to this bill');
  }
}

/**
 * Assert that a tenant owns a maintenance request.
 */
export async function assertTenantOwnsMaintenanceRequest(
  tenantId: string,
  requestId: string
): Promise<void> {
  const request = await prisma.maintenanceRequest.findUnique({
    where: { id: requestId },
    select: { createdById: true },
  });

  if (!request) {
    throw new Error('Maintenance request not found');
  }

  if (request.createdById !== tenantId) {
    throw new Error('FORBIDDEN: You do not have access to this maintenance request');
  }
}
