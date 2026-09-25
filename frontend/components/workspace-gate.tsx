'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWorkspace } from './workspace-provider';
import { workspaceDestination } from '../lib/workspace-navigation';

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { status, config } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const ready = config.enabled && status === 'signedIn';

  useEffect(() => {
    if (ready || (config.enabled && status === 'loading')) return;
    const returnTo = workspaceDestination(pathname + window.location.search + window.location.hash);
    router.replace('/connect?returnTo=' + encodeURIComponent(returnTo));
  }, [ready, status, config.enabled, pathname, router]);

  if (!ready) return <main id="main-content" tabIndex={-1} className="grid min-h-dvh place-items-center bg-canvas px-6 text-center text-muted">
    <p role="status">{status === 'loading' ? 'Checking your wallet session…' : 'Opening wallet sign-in…'}</p>
  </main>;

  return children;
}
