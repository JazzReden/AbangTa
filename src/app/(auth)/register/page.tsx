import { AccountPortal, type PortalSearch } from '@/components/auth/AccountPortal';
export const metadata = { title: 'Create Account' };
export default async function RegisterPage({ searchParams }: { searchParams: Promise<PortalSearch> }) {
  return <AccountPortal mode="register" search={await searchParams} />;
}
