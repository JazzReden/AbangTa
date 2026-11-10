import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { MeterReadingService } from '@/services/billing/meter-reading.service';
import { createMeterReadingAction } from '@/app/landlord/billing/actions';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { formatDateInput, getCurrentBillingPeriod, formatDate } from '@/lib/utils/dates';
import { formatPeso } from '@/lib/utils/currency';
import { notFound } from 'next/navigation';

export default async function ReadingsPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const user = await requireLandlord();
  const property = await PropertyService.getPropertyDetail(propertyId, user.id);
  if (!property) notFound();
  const readings = await MeterReadingService.getPropertyReadings(propertyId, user.id);
  const period = getCurrentBillingPeriod();
  const configs = property.utilityConfigs.filter(c => c.billingMethod === 'METERED');
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6 space-y-5">
      <h1 className="text-2xl font-bold">{property.name}: meters</h1>
      <PropertyNav propertyId={propertyId} current="readings" />
      {!configs.length && <p>No metered utilities configured.</p>}
      <div className="grid gap-5 md:grid-cols-2">
        {configs.map(config => (
          <StatefulForm key={config.id} action={createMeterReadingAction.bind(null, propertyId)} className="space-y-3 border rounded-lg p-4">
            <h2 className="font-semibold">{config.utilityType === 'WATER' ? 'Water' : 'Electricity'} ({config.unit})</h2>
            <p className="text-sm text-muted-foreground">{formatPeso(config.ratePerUnit ?? 0)} per {config.unit}</p>
            <input type="hidden" name="utilityConfigId" value={config.id} />
            {config.splitMethod === 'PER_ROOM' ? (
              <label className="block">Room
                <select name="roomId" required className="block w-full border rounded-lg p-2">
                  {property.rooms.map(room => <option key={room.id} value={room.id}>{room.roomNumber}</option>)}
                </select>
              </label>
            ) : <p className="text-sm">Property meter: equal split across occupied rooms</p>}
            <Field name="billingPeriodStart" label="Period start" type="date" defaultValue={formatDateInput(period.start)} />
            <Field name="billingPeriodEnd" label="Period end" type="date" defaultValue={formatDateInput(period.end)} />
            <Field name="readingDate" label="Reading date" type="date" defaultValue={formatDateInput(new Date())} />
            <Field name="previousReading" label="Previous reading" type="number" min="0" step="0.001" />
            <Field name="currentReading" label="Current reading" type="number" min="0" step="0.001" />
            <label className="flex items-center gap-2"><input name="isMeterReset" type="checkbox" /> Meter replaced or reset</label>
            <label className="block">Notes<textarea name="notes" maxLength={500} className="block w-full border rounded-lg p-2" /></label>
            <SubmitButton className="w-full rounded-lg bg-primary p-3 text-white">Save reading</SubmitButton>
          </StatefulForm>
        ))}
      </div>
      <h2 className="font-semibold">Reading history</h2>
      {!readings.length && <p>No readings recorded.</p>}
      <div className="space-y-3">
        {readings.map(reading => <article key={reading.id} className="border rounded-lg p-4">
          <p className="font-semibold">{reading.utilityConfig.utilityType} / {reading.room ? 'Room ' + reading.room.roomNumber : 'Property meter'}</p>
          <p>{reading.previousReading.toString()} to {reading.currentReading.toString()} / {reading.consumption.toString()} {reading.utilityConfig.unit}</p>
          <p>{formatPeso(reading.chargeAmount)} / {formatDate(reading.billingPeriodStart)} to {formatDate(reading.billingPeriodEnd)}</p>
        </article>)}
      </div>
    </div>
  );
}
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block text-sm">{label}<input {...props} required className="block w-full rounded-lg border p-2" /></label>;
}
