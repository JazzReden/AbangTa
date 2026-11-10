'use server';
import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/auth/session';
import { TenantService } from '@/services/tenants/tenant.service';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { actionError } from '@/lib/actions/form';

export async function activateInviteAction(_state: { error?: string }, form: FormData) {
  try {
    const user = await requireTenant();
    if (!(await checkRateLimit('invite:' + user.id, { limit: 10, windowMs: 60000 })).allowed) {
      return { error: 'Too many attempts. Please wait a minute.' };
    }
    await TenantService.acceptInvitation(String(form.get('token') ?? ''), user.id);
  } catch (error) { return actionError(error); }
  redirect('/tenant/dashboard');
}
