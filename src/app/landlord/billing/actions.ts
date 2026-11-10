'use server';

import { revalidatePath } from 'next/cache';
import { requireLandlord } from '@/lib/auth/session';
import { actionError, checkboxField, numericField, optionalString } from '@/lib/actions/form';
import {
  generateBillSchema,
  meterReadingSchema,
  recordPaymentSchema,
} from '@/lib/validations';
import { BillingService } from '@/services/billing/billing.service';
import { MeterReadingService } from '@/services/billing/meter-reading.service';
import { PaymentService } from '@/services/billing/payment.service';
import { philippineDate } from '@/lib/utils/philippine-dates';
import { parseAdditionalCharges } from '@/lib/utils/additional-charges';
import { ReceiptService } from '@/services/billing/receipt.service';
import { ReminderService } from '@/services/billing/reminder.service';

export async function confirmExistingReceiptAction(propertyId: string, paymentId: string, _state: { error?: string; success?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    if (!checkboxField(form.get('confirmed'))) return { error: 'Confirm that you received this payment.' };
    await ReceiptService.confirmExisting(paymentId, user.id);
    revalidatePath(`/landlord/properties/${propertyId}/bills`, 'layout');
    revalidatePath('/tenant', 'layout');
    return { success: 'Payment confirmed. Receipt is available.' };
  } catch (error) { return actionError(error); }
}

export async function sendBillReminderAction(propertyId: string, billId: string, _state: { error?: string; success?: string }, _form: FormData) {
  try {
    const user = await requireLandlord();
    const result = await ReminderService.send(billId, user.id);
    revalidatePath(`/landlord/properties/${propertyId}/bills/${billId}`);
    revalidatePath('/tenant', 'layout');
    return result.sent ? { success: result.reason } : { error: result.reason };
  } catch (error) { return actionError(error); }
}

export async function generateBillAction(
  propertyId: string,
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireLandlord();
    const parsed = generateBillSchema.safeParse({
      tenancyId: optionalString(formData.get('tenancyId')),
      billingPeriodStart: optionalString(formData.get('billingPeriodStart')),
      billingPeriodEnd: optionalString(formData.get('billingPeriodEnd')),
      dueDate: optionalString(formData.get('dueDate')),
      waterMeterReadingId: optionalString(formData.get('waterMeterReadingId')),
      electricityMeterReadingId: optionalString(formData.get('electricityMeterReadingId')),
      sharedWaterAmount: numericField(formData.get('sharedWaterAmount')),
      sharedElectricityAmount: numericField(formData.get('sharedElectricityAmount')),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid bill details' };
    }

    await BillingService.generateMonthlyBill(
      {
        tenancyId: parsed.data.tenancyId,
        applyAdvance: checkboxField(formData.get('applyAdvance')),
        billingPeriodStart: philippineDate(parsed.data.billingPeriodStart),
        billingPeriodEnd: philippineDate(parsed.data.billingPeriodEnd, true),
        dueDate: philippineDate(parsed.data.dueDate, true),
        waterMeterReadingId: parsed.data.waterMeterReadingId,
        electricityMeterReadingId: parsed.data.electricityMeterReadingId,
        sharedWaterAmount: parsed.data.sharedWaterAmount,
        sharedElectricityAmount: parsed.data.sharedElectricityAmount,
        createdById: user.id,
        additionalCharges: formData.has('additionalCharges') ? parseAdditionalCharges(formData.get('additionalCharges')) : undefined,
      },
      user.id
    );

    revalidatePath(`/landlord/properties/${propertyId}`);
    revalidatePath(`/landlord/properties/${propertyId}/bills`);
    revalidatePath('/landlord/bills');
    revalidatePath('/tenant', 'layout');
    return { success: 'Monthly bill generated.' };
  } catch (error) {
    return actionError(error);
  }
}

export async function recordPaymentAction(
  propertyId: string,
  billId: string,
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireLandlord();
    if (!checkboxField(formData.get('received'))) return { error: 'Confirm the payment was received before recording it.' };
    const parsed = recordPaymentSchema.safeParse({
      billId,
      amount: Number(formData.get('amount')),
      paymentDate: optionalString(formData.get('paymentDate')),
      paymentMethod: formData.get('paymentMethod'),
      referenceNumber: optionalString(formData.get('referenceNumber')),
      notes: optionalString(formData.get('notes')),
      idempotencyKey: optionalString(formData.get('idempotencyKey')),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid payment details' };
    }

    await PaymentService.recordPayment(
      {
        ...parsed.data,
        paymentDate: philippineDate(parsed.data.paymentDate),
        recordedById: user.id,
      },
      user.id
    );

    revalidatePath(`/landlord/properties/${propertyId}/bills/${billId}`);
    revalidatePath(`/landlord/properties/${propertyId}/bills`);
    revalidatePath('/landlord/payments');
    revalidatePath('/tenant', 'layout');
    return { success: 'Payment recorded.' };
  } catch (error) {
    return actionError(error);
  }
}

export async function createMeterReadingAction(
  propertyId: string,
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireLandlord();
    const parsed = meterReadingSchema.safeParse({
      utilityConfigId: optionalString(formData.get('utilityConfigId')),
      roomId: optionalString(formData.get('roomId')),
      billingPeriodStart: optionalString(formData.get('billingPeriodStart')),
      billingPeriodEnd: optionalString(formData.get('billingPeriodEnd')),
      previousReading: Number(formData.get('previousReading')),
      currentReading: Number(formData.get('currentReading')),
      readingDate: optionalString(formData.get('readingDate')),
      isMeterReset: checkboxField(formData.get('isMeterReset')),
      notes: optionalString(formData.get('notes')),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid meter reading' };
    }

    await MeterReadingService.createReading(
      {
        utilityConfigId: parsed.data.utilityConfigId,
        propertyId,
        roomId: parsed.data.roomId,
        billingPeriodStart: philippineDate(parsed.data.billingPeriodStart),
        billingPeriodEnd: philippineDate(parsed.data.billingPeriodEnd, true),
        previousReading: parsed.data.previousReading,
        currentReading: parsed.data.currentReading,
        readingDate: philippineDate(parsed.data.readingDate),
        isMeterReset: parsed.data.isMeterReset,
        notes: parsed.data.notes,
        createdById: user.id,
      },
      user.id
    );

    revalidatePath(`/landlord/properties/${propertyId}/readings`);
    return { success: 'Meter reading saved.' };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelBillAction(propertyId: string, billId: string) {
  const user = await requireLandlord();
  await BillingService.cancelBill(billId, user.id);
  revalidatePath(`/landlord/properties/${propertyId}/bills`);
}

export async function voidPaymentAction(_propertyId: string, paymentId: string, _state: { error?: string; success?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    await PaymentService.voidPayment(paymentId, String(form.get('reason') ?? ''), user.id);
    revalidatePath('/landlord');
    revalidatePath('/tenant');
    return { success: 'Payment voided. Balance updated.' };
  } catch (error) { return actionError(error); }
}

export async function cancelBillStateAction(propertyId: string, billId: string, _state: { error?: string; success?: string }, _form: FormData) {
  try {
    await cancelBillAction(propertyId, billId);
    revalidatePath('/landlord');
    revalidatePath('/tenant');
    return { success: 'Bill cancelled.' };
  } catch (error) { return actionError(error); }
}
