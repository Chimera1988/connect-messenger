import type { Metadata, Viewport } from 'next';
import InvitationCodes from '../components/InvitationCodes';
import ConnectDynamicTheme from '../components/ConnectDynamicTheme';
import ConnectUiCoordinator from '../components/ConnectUiCoordinator';
import ConnectCallBridge from '../components/ConnectCallBridge';
import ConnectCallsHub from '../components/ConnectCallsHub';
import ConnectSonicRunner from '../components/ConnectSonicRunner';
import { ConnectMusicProvider } from '../components/ConnectMusicSystem';
import './globals.css';
import './liquid-glass.css';
import './calls.css';
import './call-journal-editor.css';
import './profile-media.css';
import './connect-unified-chat.css';
import './music-system.css';
import './connect-splash.css';
import './connect-icons.css';

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
  return <html lang="ru"><body><ConnectMusicProvider>{children}</ConnectMusicProvider><InvitationCodes /><ConnectDynamicTheme /><ConnectUiCoordinator /><ConnectCallBridge /><ConnectCallsHub /><ConnectSonicRunner /></body></html>;
}
