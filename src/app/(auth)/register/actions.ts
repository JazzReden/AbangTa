'use server';
import type { ServerActionResult } from '@/types';
export async function registerLandlord(_formData: FormData): Promise<ServerActionResult<{ email: string }>> {
  return { success: false, error: 'Please create your account using Google sign-in.' };
}
