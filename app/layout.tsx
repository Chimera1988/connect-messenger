import type { Metadata, Viewport } from 'next';
import InvitationCodes from '../components/InvitationCodes';
import './globals.css';

export const metadata: Metadata = {
  title: 'Connect',
  description: 'Личный мессенджер Connect',
  applicationName: 'Connect',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Connect' },
  icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#080b11',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}<InvitationCodes /></body></html>;
}
