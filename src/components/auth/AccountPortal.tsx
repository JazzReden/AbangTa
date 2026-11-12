import Link from 'next/link';
import { ArrowLeft, ArrowRight, Building2, KeyRound, LogIn, UserPlus } from 'lucide-react';
import { startGoogleAuthentication, submitPasswordAccount } from '@/app/auth/actions';
import { safeReturnTo } from '@/lib/auth/intent';
import type { AuthIntent } from '@/lib/auth/intent';
import { SubmitButton, StatefulForm } from '@/components/ui/StatefulForm';
import { PasswordField } from './PasswordField';
import { SiteFooter } from '@/components/SiteFooter';
import { BoardingHouseScenery } from '@/components/marketing/BoardingHouseScenery';
import styles from './AccountPortal.module.css';

export type PortalSearch = { role?: string; callbackUrl?: string; reason?: string; error?: string };

const errors: Record<string, string> = {
  'google-unavailable': 'Google sign-in needs OAuth configuration. You can create your account using the form below.',
  'password-first': 'This email already has a password account. Sign in with your password before connecting Google.',
  'wrong-role': 'This Google account belongs to the other account type. Choose its correct sign-in portal.',
  'create-account': 'No AbangTa account was found for this Google account. Create an account first.',
  'account-exists': 'Your account already exists. Please sign in.',
  'identity-mismatch': 'This Google account does not match the existing account.',
  'confirm-role': 'Please confirm your account type before continuing.',
  'expired-flow': 'Your sign-in session expired. Please try again.',
  'authentication-failed': 'We could not complete Google sign-in. Please try again.',
};

export function AccountPortal({ mode, search }: { mode: AuthIntent['mode']; search: PortalSearch }) {
  const role = search.role === 'LANDLORD' || search.role === 'TENANT' ? search.role : undefined;
  const roleLabel = role === 'LANDLORD' ? 'Landlord' : 'Tenant';
  const returnTo = safeReturnTo(search.callbackUrl);
  const registering = mode === 'register';
  const message = errors[search.reason ?? ''] ?? (search.error ? errors['authentication-failed'] : undefined);

  function href(nextMode: AuthIntent['mode'], nextRole?: AuthIntent['role']) {
    const query = new URLSearchParams();
    if (nextRole) query.set('role', nextRole);
    if (returnTo !== '/onboarding') query.set('callbackUrl', returnTo);
    return '/auth/' + (nextMode === 'register' ? 'register' : 'login') + (query.size ? '?' + query : '');
  }

  return (
    <>
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="AbangTa home"><span className={styles.brandIcon}><Building2 size={24} strokeWidth={1.6} aria-hidden="true" /></span>AbangTa<span className={styles.brandDot}>.</span></Link>
        <Link href="/" className={styles.homeLink}><ArrowLeft size={16} aria-hidden="true" /> Back to home</Link>
      </div>
      <div className={styles.layout}>
        <aside className={styles.story} aria-hidden="true">
          <div className={styles.illustration} aria-hidden="true">
            <BoardingHouseScenery />
            <svg className={styles.building} viewBox="0 0 320 250" fill="none" focusable="false">
              <rect x="25" y="40" width="270" height="195" rx="5" fill="hsl(var(--background))" stroke="hsl(var(--border))" strokeWidth="8" />
              <rect x="14" y="25" width="292" height="38" rx="6" fill="hsl(var(--foreground))" />
              <path d="M160 65v167M29 148h262" stroke="hsl(var(--secondary))" strokeWidth="8" />
              {[0, 1, 2, 3].map(index => <g key={index} transform={`translate(${index % 2 * 135},${Math.floor(index / 2) * 86})`}>
                <rect x="44" y="83" width="51" height="37" rx="2" fill={index === 0 ? 'hsl(var(--primary) / .35)' : 'hsl(var(--secondary))'} stroke="hsl(var(--card))" strokeWidth="4" />
                <path d="M69 84v34" stroke="hsl(var(--card))" strokeWidth="3" />
                <rect x="111" y="91" width="26" height="53" fill="hsl(var(--muted-foreground) / .28)" />
                <circle cx="130" cy="120" r="1.5" fill="hsl(var(--card))" />
              </g>)}
              <path d="M15 238h291" stroke="hsl(var(--foreground))" strokeWidth="7" strokeLinecap="round" />
              <path d="M37 44h20m207 0h18" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>

        </aside>
        <div className={styles.formCard}>
          <header className={styles.formHeader}>
            <h1>{registering ? 'Make yourself at home.' : 'Welcome back.'}</h1>
            <p>{registering ? 'Create your AbangTa account to get started.' : 'Your boarding house, all in one place.'}</p>
          </header>

        <nav aria-label="Account access" className="mt-8 grid grid-cols-2 rounded-lg bg-muted p-1">
          <Link href={href('signin', role)} aria-current={!registering ? 'page' : undefined}
            className={'flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ' + (!registering ? 'bg-white shadow-sm' : 'text-muted-foreground')}>
            <LogIn size={16} aria-hidden="true" /> Sign in
          </Link>
          <Link href={href('register', role)} aria-current={registering ? 'page' : undefined}
            className={'flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ' + (registering ? 'bg-white shadow-sm' : 'text-muted-foreground')}>
            <UserPlus size={16} aria-hidden="true" /> Create account
          </Link>
        </nav>

        {message && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p>}

        {!role ? (
          <section className="mt-7">
            <h2 className="mb-6 text-center text-base text-muted-foreground">{registering ? 'Choose your account type' : 'Choose your sign-in portal'}</h2>
            <Link href={href(mode, 'LANDLORD')} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-primary px-4 py-3 text-base font-semibold text-white transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              <Building2 size={21} aria-hidden="true" />
              {registering ? 'Create Landlord Account' : 'Sign in as Landlord'}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="mb-6 mt-2 text-center text-xs text-muted-foreground">Property owner or manager</p>
            <Link href={href(mode, 'TENANT')} className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-primary/40 bg-white px-4 py-3 text-base font-semibold text-primary transition hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
              <KeyRound size={21} aria-hidden="true" />
              {registering ? 'Create Tenant Account' : 'Sign in as Tenant'}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="mt-2 text-center text-xs text-muted-foreground">Boarding house resident</p>
          </section>
        ) : (
          <section className="mt-7">
            <Link href={href(mode)} className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" /> Change account type</Link>
            <h2 className="mt-3 text-2xl font-bold">{registering ? 'Create a ' + roleLabel.toLowerCase() + ' account' : roleLabel + ' sign in'}</h2>
            <StatefulForm action={submitPasswordAccount.bind(null, role, mode, returnTo)} className="mt-5 space-y-4">
              {registering && <AccountField label="Full name" name="name" autoComplete="name" required minLength={2} maxLength={100} />}
              <AccountField label="Email or mobile number" name="identifier" autoComplete="username" placeholder="you@example.com or 0917 123 4567" required maxLength={254} />
              <PasswordField registering={registering} />
              <SubmitButton className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                {registering ? <UserPlus size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
                {registering ? 'Create account' : 'Sign in'}
              </SubmitButton>
            </StatefulForm>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /><span>or</span><div className="h-px flex-1 bg-border" />
            </div>
            <form action={startGoogleAuthentication.bind(null, role, mode, returnTo)}>
              <SubmitButton className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-input bg-white px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60">
                <LogIn size={18} aria-hidden="true" /> Sign in with Google
              </SubmitButton>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {registering ? 'Already have an account? ' : 'New to AbangTa? '}
              <Link href={href(registering ? 'signin' : 'register', role)} className="font-semibold text-primary underline underline-offset-4">{registering ? 'Sign in' : 'Create an account'}</Link>
            </p>
          </section>
        )}
        </div>
      </div>
    </main>
    <SiteFooter />
    </>
  );
}

function AccountField({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block text-sm font-medium">
    <span className="mb-1.5 block">{label}</span>
    <input {...props} className="block min-h-12 w-full rounded-lg border border-input bg-white px-4 py-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring" />
  </label>;
}
