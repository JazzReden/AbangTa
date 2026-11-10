import { AccountPortal, type PortalSearch } from '@/components/auth/AccountPortal';
export const metadata = { title: 'Sign In' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<PortalSearch> }) {
  return <AccountPortal mode="signin" search={await searchParams} />;
}
