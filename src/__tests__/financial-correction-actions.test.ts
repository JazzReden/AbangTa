import { revalidatePath } from 'next/cache';
import { voidPaymentAction, cancelBillStateAction } from '@/app/landlord/billing/actions';
import { PaymentService } from '@/services/billing/payment.service';
import { BillingService } from '@/services/billing/billing.service';

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/auth/session', () => ({ requireLandlord: jest.fn().mockResolvedValue({ id: 'owner' }) }));
jest.mock('@/services/billing/payment.service', () => ({ PaymentService: { voidPayment: jest.fn() } }));
jest.mock('@/services/billing/billing.service', () => ({ BillingService: { cancelBill: jest.fn() } }));
jest.mock('@/lib/db/prisma', () => ({ prisma: {} }));

beforeEach(() => jest.clearAllMocks());
test('successful corrections refresh bills, dashboards and history through both layouts', async () => {
  const form = new FormData(); form.set('reason', 'Duplicate entry');
  expect(await voidPaymentAction('property', 'payment', {}, form)).toHaveProperty('success');
  expect(PaymentService.voidPayment).toHaveBeenCalledWith('payment', 'Duplicate entry', 'owner');
  expect(revalidatePath).toHaveBeenCalledWith('/landlord', 'layout');
  expect(revalidatePath).toHaveBeenCalledWith('/tenant', 'layout');
  jest.mocked(revalidatePath).mockClear();
  expect(await cancelBillStateAction('property', 'bill', {}, new FormData())).toHaveProperty('success');
  expect(BillingService.cancelBill).toHaveBeenCalledWith('bill', 'owner');
  expect(revalidatePath).toHaveBeenCalledWith('/tenant', 'layout');
});
test('failed corrections show an error and never claim success or refresh data', async () => {
  jest.mocked(PaymentService.voidPayment).mockRejectedValueOnce(new Error('FORBIDDEN'));
  expect(await voidPaymentAction('property', 'payment', {}, new FormData())).toEqual({ error: 'FORBIDDEN' });
  expect(revalidatePath).not.toHaveBeenCalled();
});
