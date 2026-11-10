import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production' || await prisma.user.count() > 0) {
    throw new Error('Demo seed requires an empty development database. Existing records will not be deleted.');
  }
  const passwordHash = await bcrypt.hash('Password123', 12);


  const landlord = await prisma.user.create({
    data: {
      name: 'Demo Landlord',
      email: process.env.DEMO_LANDLORD_EMAIL ?? 'landlord@example.com',
      passwordHash,
      role: 'LANDLORD',
      phone: '+63 917 000 0000',
      landlordProfile: {
        create: {
          businessName: 'AbangTa Boarding House',
          bio: 'Demo landlord account for AbangTa development.',
        },
      },
    },
  });

  const [maria, jose, ana] = await Promise.all([
    createTenant('Maria Santos', process.env.DEMO_TENANT_EMAIL ?? 'maria@example.com', '+63 917 111 1111', passwordHash),
    createTenant('Jose Reyes', 'jose@example.com', '+63 917 222 2222', passwordHash),
    createTenant('Ana Cruz', 'ana@example.com', '+63 917 333 3333', passwordHash),
  ]);

  const propertyA = await prisma.property.create({
    data: {
      landlordId: landlord.id,
      name: 'AbangTa Boarding House',
      address: 'Cebu City, Philippines',
      description: 'Main demo property: water included, electricity metered.',
      contactPhone: '+63 917 000 0000',
      contactEmail: 'landlord@example.com',
    },
  });

  const propertyB = await prisma.property.create({
    data: {
      landlordId: landlord.id,
      name: 'Mango Street Rooms',
      address: 'Mango Avenue, Cebu City',
      description: 'Demo property: fixed-rate water, electricity included.',
      contactPhone: '+63 917 000 0000',
    },
  });

  const propertyC = await prisma.property.create({
    data: {
      landlordId: landlord.id,
      name: 'Lahug Student House',
      address: 'Lahug, Cebu City',
      description: 'Demo property: water and electricity both metered.',
      contactPhone: '+63 917 000 0000',
    },
  });

  const room101 = await createRoom(propertyA.id, '101', 'OCCUPIED', '4000.00', 1);
  await createRoom(propertyA.id, '102', 'VACANT', '4200.00', 1);
  await createRoom(propertyA.id, '103', 'MAINTENANCE', '3900.00', 1);

  const room201 = await createRoom(propertyB.id, '201', 'OCCUPIED', '4500.00', 2);
  await createRoom(propertyB.id, '202', 'VACANT', '4500.00', 2);

  const room301 = await createRoom(propertyC.id, '301', 'OCCUPIED', '5000.00', 1);
  await createRoom(propertyC.id, '302', 'VACANT', '5000.00', 1);

  const [waterA, electricA, waterB, electricB, waterC, electricC] = await Promise.all([
    prisma.utilityConfig.create({
      data: {
        propertyId: propertyA.id,
        utilityType: 'WATER',
        billingMethod: 'INCLUDED',
        splitMethod: 'EQUAL_SPLIT',
      },
    }),
    prisma.utilityConfig.create({
      data: {
        propertyId: propertyA.id,
        utilityType: 'ELECTRICITY',
        billingMethod: 'METERED',
        ratePerUnit: '15.0000',
        unit: 'kWh',
        splitMethod: 'PER_ROOM',
      },
    }),
    prisma.utilityConfig.create({
      data: {
        propertyId: propertyB.id,
        utilityType: 'WATER',
        billingMethod: 'FIXED_RATE',
        fixedAmount: '150.00',
        splitMethod: 'EQUAL_SPLIT',
      },
    }),
    prisma.utilityConfig.create({
      data: {
        propertyId: propertyB.id,
        utilityType: 'ELECTRICITY',
        billingMethod: 'INCLUDED',
        splitMethod: 'EQUAL_SPLIT',
      },
    }),
    prisma.utilityConfig.create({
      data: {
        propertyId: propertyC.id,
        utilityType: 'WATER',
        billingMethod: 'METERED',
        ratePerUnit: '40.0000',
        unit: 'm3',
        splitMethod: 'PER_ROOM',
      },
    }),
    prisma.utilityConfig.create({
      data: {
        propertyId: propertyC.id,
        utilityType: 'ELECTRICITY',
        billingMethod: 'METERED',
        ratePerUnit: '15.0000',
        unit: 'kWh',
        splitMethod: 'PER_ROOM',
      },
    }),
  ]);

  const periodStart = new Date('2026-09-01T00:00:00+08:00');
  const periodEnd = new Date('2026-09-30T23:59:59+08:00');
  const dueDate = new Date('2026-09-15T23:59:59+08:00');
  const readingDate = new Date('2026-09-30T09:00:00+08:00');

  const tenancyA = await createTenancy(maria.id, room101.id, propertyA.id, '4000.00');
  const tenancyB = await createTenancy(jose.id, room201.id, propertyB.id, '4500.00');
  const tenancyC = await createTenancy(ana.id, room301.id, propertyC.id, '5000.00');

  const readingElectricA = await createReading({
    configId: electricA.id,
    propertyId: propertyA.id,
    roomId: room101.id,
    previous: '1250.000',
    current: '1285.000',
    rate: '15.0000',
    charge: '525.00',
    createdById: landlord.id,
    periodStart,
    periodEnd,
    readingDate,
  });

  const readingWaterC = await createReading({
    configId: waterC.id,
    propertyId: propertyC.id,
    roomId: room301.id,
    previous: '105.000',
    current: '108.000',
    rate: '40.0000',
    charge: '120.00',
    createdById: landlord.id,
    periodStart,
    periodEnd,
    readingDate,
  });

  const readingElectricC = await createReading({
    configId: electricC.id,
    propertyId: propertyC.id,
    roomId: room301.id,
    previous: '800.000',
    current: '830.000',
    rate: '15.0000',
    charge: '450.00',
    createdById: landlord.id,
    periodStart,
    periodEnd,
    readingDate,
  });

  const billA = await createBill({
    tenancyId: tenancyA.id,
    propertyId: propertyA.id,
    createdById: landlord.id,
    totalAmount: '4525.00',
    amountPaid: '2000.00',
    status: 'PARTIALLY_PAID',
    periodStart,
    periodEnd,
    dueDate,
    items: [
      {
        itemType: 'RENT',
        description: 'Room 101 - Monthly Rent',
        billingMethod: 'FIXED_RATE',
        amount: '4000.00',
        rateSnapshot: '4000.0000',
        isIncluded: false,
      },
      {
        itemType: 'WATER',
        description: 'Water - Included in Rent',
        billingMethod: 'INCLUDED',
        amount: '0.00',
        isIncluded: true,
      },
      {
        itemType: 'ELECTRICITY',
        description: 'Electricity - 35 kWh x 15/kWh',
        billingMethod: 'METERED',
        amount: '525.00',
        rateSnapshot: '15.0000',
        meterReadingId: readingElectricA.id,
        isIncluded: false,
      },
    ],
  });

  const billB = await createBill({
    tenancyId: tenancyB.id,
    propertyId: propertyB.id,
    createdById: landlord.id,
    totalAmount: '4650.00',
    amountPaid: '4650.00',
    status: 'PAID',
    periodStart,
    periodEnd,
    dueDate,
    items: [
      {
        itemType: 'RENT',
        description: 'Room 201 - Monthly Rent',
        billingMethod: 'FIXED_RATE',
        amount: '4500.00',
        rateSnapshot: '4500.0000',
        isIncluded: false,
      },
      {
        itemType: 'WATER',
        description: 'Water - Monthly Fixed Rate',
        billingMethod: 'FIXED_RATE',
        amount: '150.00',
        rateSnapshot: '150.0000',
        isIncluded: false,
      },
      {
        itemType: 'ELECTRICITY',
        description: 'Electricity - Included in Rent',
        billingMethod: 'INCLUDED',
        amount: '0.00',
        isIncluded: true,
      },
    ],
  });

  await createBill({
    tenancyId: tenancyC.id,
    propertyId: propertyC.id,
    createdById: landlord.id,
    totalAmount: '5570.00',
    amountPaid: '0.00',
    status: 'OVERDUE',
    periodStart,
    periodEnd,
    dueDate,
    items: [
      {
        itemType: 'RENT',
        description: 'Room 301 - Monthly Rent',
        billingMethod: 'FIXED_RATE',
        amount: '5000.00',
        rateSnapshot: '5000.0000',
        isIncluded: false,
      },
      {
        itemType: 'WATER',
        description: 'Water - 3 m3 x 40/m3',
        billingMethod: 'METERED',
        amount: '120.00',
        rateSnapshot: '40.0000',
        meterReadingId: readingWaterC.id,
        isIncluded: false,
      },
      {
        itemType: 'ELECTRICITY',
        description: 'Electricity - 30 kWh x 15/kWh',
        billingMethod: 'METERED',
        amount: '450.00',
        rateSnapshot: '15.0000',
        meterReadingId: readingElectricC.id,
        isIncluded: false,
      },
    ],
  });

  await prisma.payment.create({
    data: {
      billId: billA.id,
      tenancyId: tenancyA.id,
      amount: '2000.00',
      paymentDate: new Date('2026-09-10T11:00:00+08:00'),
      paymentMethod: 'GCASH',
      referenceNumber: 'GCASH-DEMO-001',
      notes: 'Partial payment recorded for demo.',
      recordedById: landlord.id,
    },
  });

  await prisma.payment.create({
    data: {
      billId: billB.id, tenancyId: tenancyB.id, amount: '4650.00',
      paymentDate: new Date('2026-09-12T11:00:00+08:00'), paymentMethod: 'CASH',
      notes: 'Demo full payment', recordedById: landlord.id,
    },
  });

  await prisma.maintenanceRequest.create({
    data: {
      tenancyId: tenancyA.id,
      propertyId: propertyA.id,
      roomId: room101.id,
      title: 'Leaking faucet',
      description: 'The bathroom faucet keeps dripping even when fully closed.',
      category: 'PLUMBING',
      priority: 'MEDIUM',
      status: 'IN_PROGRESS',
      statusNotes: 'Plumber scheduled for inspection.',
      createdById: maria.id,
    },
  });

  await prisma.announcement.create({
    data: {
      propertyId: propertyA.id,
      title: 'Water interruption notice',
      message: 'Water service may be interrupted tomorrow from 9 AM to 12 PM.',
      createdById: landlord.id,
      expiresAt: new Date('2026-10-15T23:59:59+08:00'),
    },
  });

  await Promise.all([
    prisma.notification.create({
      data: {
        userId: maria.id,
        type: 'NEW_BILL',
        title: 'New bill generated',
        message: 'Your September 2026 bill is ready.',
        relatedEntityType: 'Bill',
        relatedEntityId: billA.id,
      },
    }),
    prisma.notification.create({
      data: {
        userId: landlord.id,
        type: 'MAINTENANCE_STATUS_CHANGED',
        title: 'Open maintenance request',
        message: 'Maria Santos submitted a plumbing request for Room 101.',
      },
    }),
  ]);

  console.log('Seed complete');
  console.log('Sign in with the Google email configured for DEMO_LANDLORD_EMAIL or DEMO_TENANT_EMAIL.');

  void waterA;
  void waterB;
  void electricB;
}

async function createTenant(
  name: string,
  email: string,
  phone: string,
  passwordHash: string
) {
  return prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash,
      role: 'TENANT',
      tenantProfile: {
        create: {
          emergencyContact: 'Emergency Contact',
          emergencyPhone: '+63 917 999 9999',
        },
      },
    },
  });
}

async function createRoom(
  propertyId: string,
  roomNumber: string,
  status: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE',
  monthlyRent: string,
  capacity: number
) {
  return prisma.room.create({
    data: {
      propertyId,
      roomNumber,
      status,
      monthlyRent,
      capacity,
    },
  });
}

async function createTenancy(
  tenantId: string,
  roomId: string,
  propertyId: string,
  monthlyRent: string
) {
  return prisma.tenancy.create({
    data: {
      tenantId,
      roomId,
      propertyId,
      startDate: new Date('2026-09-01T00:00:00+08:00'),
      monthlyRent,
      securityDeposit: monthlyRent,
      status: 'ACTIVE',
    },
  });
}

async function createReading(input: {
  configId: string;
  propertyId: string;
  roomId: string;
  previous: string;
  current: string;
  rate: string;
  charge: string;
  createdById: string;
  periodStart: Date;
  periodEnd: Date;
  readingDate: Date;
}) {
  return prisma.meterReading.create({
    data: {
      utilityConfigId: input.configId,
      propertyId: input.propertyId,
      roomId: input.roomId,
      billingPeriodStart: input.periodStart,
      billingPeriodEnd: input.periodEnd,
      previousReading: input.previous,
      currentReading: input.current,
      consumption: new Decimal(input.current).minus(input.previous).toFixed(3),
      rateAtTime: input.rate,
      chargeAmount: input.charge,
      readingDate: input.readingDate,
      createdById: input.createdById,
    },
  });
}

async function createBill(input: {
  tenancyId: string;
  propertyId: string;
  createdById: string;
  totalAmount: string;
  amountPaid: string;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  items: Array<{
    itemType: 'RENT' | 'WATER' | 'ELECTRICITY' | 'OTHER';
    description: string;
    billingMethod: 'INCLUDED' | 'FIXED_RATE' | 'METERED';
    amount: string;
    rateSnapshot?: string;
    meterReadingId?: string;
    isIncluded: boolean;
  }>;
}) {
  return prisma.bill.create({
    data: {
      tenancyId: input.tenancyId,
      propertyId: input.propertyId,
      createdById: input.createdById,
      totalAmount: input.totalAmount,
      amountPaid: input.amountPaid,
      status: input.status,
      billingPeriodStart: input.periodStart,
      billingPeriodEnd: input.periodEnd,
      dueDate: input.dueDate,
      items: {
        create: input.items,
      },
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
