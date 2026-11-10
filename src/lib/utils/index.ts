import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes without conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Safely serialize a Prisma Decimal to a plain number for client components. */
export function serializeDecimal(
  value: { toString(): string } | null | undefined
): number | null {
  if (value == null) return null;
  return parseFloat(value.toString());
}

/** Create a safe, user-facing error message — never expose internals. */
export function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}

/** Generate a URL-safe random token. */
export function generateToken(length = 32): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
