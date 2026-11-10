import { startGoogleAuthentication } from '@/app/auth/actions';
import { SubmitButton } from '@/components/ui/StatefulForm';

export function GoogleConnection({ role, connected }: { role: 'LANDLORD' | 'TENANT'; connected: boolean }) {
  return <section className="mb-6 space-y-3 border-y border-border py-4">
    <h2 className="text-sm font-semibold">Google account</h2>
    {connected ? <p className="text-sm text-muted-foreground">Google sign-in is connected.</p> : <form action={startGoogleAuthentication.bind(null, role, 'signin', '/onboarding')}>
      <SubmitButton className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Connect Google</SubmitButton>
    </form>}
  </section>;
}
