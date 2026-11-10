'use client';

export function RoomStatusSelect({
  action,
  defaultValue,
  roomId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultValue: string;
  roomId: string;
}) {
  return (
    <form action={action} className="mt-3 flex gap-2">
      <label className="sr-only" htmlFor={`status-${roomId}`}>
        Room status
      </label>
      <select
        id={`status-${roomId}`}
        name="status"
        defaultValue={defaultValue}
        className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
      >
        <option value="VACANT">Vacant</option>
        <option value="OCCUPIED">Occupied</option>
        <option value="MAINTENANCE">Maintenance</option>
      </select>
      <button className="rounded-2xl bg-muted px-3 py-2 text-xs font-semibold">Save</button>
    </form>
  );
}
