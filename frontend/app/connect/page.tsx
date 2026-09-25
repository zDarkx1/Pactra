import type { Metadata } from 'next';
import { ConnectWalletScreen } from '../../components/connect-wallet-screen';
import { workspaceDestination } from '../../lib/workspace-navigation';

export const metadata: Metadata = {
  title: 'Connect wallet',
  description: 'Connect your wallet and sign in to your Pactra workspace.',
  robots: { index: false, follow: false },
};

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { returnTo } = await searchParams;
  return <ConnectWalletScreen returnTo={workspaceDestination(typeof returnTo === 'string' ? returnTo : undefined)} />;
}
