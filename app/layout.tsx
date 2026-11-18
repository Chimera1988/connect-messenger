import type { Metadata,Viewport } from 'next';
import ConnectCallsHub from '../components/ConnectCallsHub';
import { ConnectMusicProvider } from '../components/ConnectMusicSystem';
import ConnectSessionProvider from '../components/ConnectSessionProvider';
import ConnectSonicRunner from '../components/ConnectSonicRunner';
import ConnectUiSlots from '../components/ConnectUiSlots';
import InvitationCodes from '../components/InvitationCodes';
import './admin-usage.css';
import './call-journal-editor.css';
import './calls.css';
import './connect-icons.css';
import './connect-media-frame-overlay.css';
import './connect-splash.css';
import './connect-unified-chat.css';
import './globals.css';
import './liquid-glass.css';
import './music-system.css';
import './profile-media.css';

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
  return <html lang="ru"><body><ConnectUiSlots><ConnectSessionProvider><ConnectMusicProvider>{children}</ConnectMusicProvider><InvitationCodes /><ConnectCallsHub /><ConnectSonicRunner /></ConnectSessionProvider></ConnectUiSlots></body></html>;
}
