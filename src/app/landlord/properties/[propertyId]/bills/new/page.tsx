import { notFound } from 'next/navigation';
import { BillingTenantProvider, BillingTenantSelect, TenantBillCharges } from '@/components/landlord/TenantBillCharges';
import { propertyChargeDefaults } from '@/lib/utils/additional-charges';
import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { MeterReadingService } from '@/services/billing/meter-reading.service';
import { TenantService } from '@/services/tenants/tenant.service';
import { formatDateInput, getCurrentBillingPeriod, getDueDate } from '@/lib/utils/dates';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { generateBillAction } from '@/app/landlord/billing/actions';

export const metadata = { title: 'Generate Bill' };

export default async function GenerateBillPage({ params: paramsPromise }: {
  params: Promise<{ propertyId: string }>;
}) {
  const params = await paramsPromise;
  const user = await requireLandlord();
  const property = await PropertyService.getPropertyDetail(params.propertyId, user.id);
  if (!property) notFound();
  const tenancies = (await TenantService.getPropertyTenants(property.id, user.id)).filter(tenancy => tenancy.status !== 'PENDING' && !tenancy.cancelledAt);
  const readings = await MeterReadingService.getPropertyReadings(property.id, user.id);
  const period = getCurrentBillingPeriod();
  const water = property.utilityConfigs.find((c) => c.utilityType === 'WATER');
  const electricity = property.utilityConfigs.find((c) => c.utilityType === 'ELECTRICITY');

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-6">
      <h1 className="mb-2 text-2xl font-bold">Generate monthly bill</h1>
      <PropertyNav propertyId={property.id} current="bills" />
      <BillingTenantProvider key={JSON.stringify(tenancies.map(tenancy => [tenancy.id, tenancy.parkingMode]))} tenants={tenancies.map(tenancy => ({ id: tenancy.id, name: tenancy.tenant.name + (tenancy.status === 'ENDED' ? ' (former)' : ''), roomNumber: tenancy.room.roomNumber + (tenancy.bed ? ' / ' + tenancy.bed.label : ''), parkingMode: tenancy.parkingMode }))} defaults={propertyChargeDefaults(property.billingCharges)}>
      <StatefulForm
        preserveValues
        action={generateBillAction.bind(null, property.id)}
        className="card-abangta space-y-4 rounded-3xl p-5"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Tenant / room</span>
          <BillingTenantSelect />
        </label>
        <Field name="billingPeriodStart" label="Period start" type="date" defaultValue={formatDateInput(period.start)} required />
        <Field name="billingPeriodEnd" label="Period end" type="date" defaultValue={formatDateInput(period.end)} required />
        <Field name="dueDate" label="Due date" type="date" defaultValue={formatDateInput(getDueDate(period.start))} required />

        {water?.billingMethod === 'METERED' ? (
          <>
            <ReadingSelect
              name="waterMeterReadingId"
              label="Water meter reading"
              readings={readings.filter((r) => r.utilityConfig.utilityType === 'WATER')}
            />
            {water.splitMethod === 'EQUAL_SPLIT' ? (
              <Field name="sharedWaterAmount" label="Shared water total (optional equal split)" type="number" step="0.01" />
            ) : null}
          </>
        ) : null}

        {electricity?.billingMethod === 'METERED' ? (
          <>
            <ReadingSelect
              name="electricityMeterReadingId"
              label="Electricity meter reading"
              readings={readings.filter((r) => r.utilityConfig.utilityType === 'ELECTRICITY')}
            />
            {electricity.splitMethod === 'EQUAL_SPLIT' ? (
              <Field
                name="sharedElectricityAmount"
                label="Shared electricity total (optional equal split)"
                type="number"
                step="0.01"
              />
            ) : null}
          </>
        ) : null}

        <TenantBillCharges />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="applyAdvance" className="mt-1 accent-primary" />Apply available advance credit to this bill</label>
        <p className="text-sm text-muted-foreground">
          Included utilities are shown as “Included in Rent” and do not add to the total.
        </p>
        <SubmitButton className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
          Generate bill
        </SubmitButton>
      </StatefulForm>
      </BillingTenantProvider>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...input } = props;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input {...input} className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm" />
    </label>
  );
}

function ReadingSelect({
  name,
  label,
  readings,
}: {
  name: string;
  label: string;
  readings: Array<{
    id: string;
    previousReading: { toString(): string };
    currentReading: { toString(): string };
    chargeAmount: { toString(): string };
    room: { roomNumber: string } | null;
  }>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <select name={name} className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm">
        <option value="">Select a reading</option>
        {readings.map((reading) => (
          <option key={reading.id} value={reading.id}>
            {reading.room ? `Room ${reading.room.roomNumber}` : 'Property meter'} · {reading.previousReading.toString()} → {reading.currentReading.toString()} · ₱{reading.chargeAmount.toString()}
          </option>
        ))}
      </select>
    </label>
  );
}
