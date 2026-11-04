import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Connect', description: 'Личный мессенджер Connect', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Connect' }, icons: { icon: '/favicon.png', apple: '/apple-touch-icon.png' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#090b10' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="ru"><body>{children}</body></html>; }
