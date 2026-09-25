import type { Metadata } from 'next';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/jetbrains-mono/400.css';
import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';
import { WorkspaceProvider } from '../components/workspace-provider';
import { ScrollBehavior } from '../components/scroll-behavior';
import { NavigationFocus } from '../components/navigation-focus';
import { getPublicWorkspaceConfig } from '../lib/workspace-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: { default: 'Pactra on BOT — Agreements and localization review', template: '%s · Pactra' },
  description: 'Agree on localization work before it starts. Review exact source and output with shared evidence. Agreements remain unfunded.',
  icons: { icon: '/logo-bot.svg' },
  robots: { index: process.env.PACTRA_PUBLIC_INDEXING === 'true', follow: process.env.PACTRA_PUBLIC_INDEXING === 'true' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const config = getPublicWorkspaceConfig();
  return <html lang="en"><body><ScrollBehavior /><NavigationFocus /><WorkspaceProvider config={config}>{children}</WorkspaceProvider></body></html>;
}
