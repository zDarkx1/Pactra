import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Private workspace | Pactra',
  description: 'Private task agreements. Sign in with your wallet to continue.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function TasksLayout({ children }: { children: ReactNode }) {
  return children;
}
