import type { Metadata } from 'next';
import './globals.css';
import { AuthSessionProvider } from '@/components/providers/AuthSessionProvider';

export const metadata: Metadata = {
  title: {
    default: 'AbangTa — Your Boarding House, All in One Place',
    template: '%s | AbangTa',
  },
  description:
    'AbangTa is a boarding-house and rental-property management platform for landlords and tenants in the Philippines.',
  keywords: ['boarding house', 'rent', 'property management', 'Philippines'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans">
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
