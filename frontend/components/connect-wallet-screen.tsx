'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useWorkspace } from './workspace-provider';
import { WalletControl } from './wallet-control';
import { Icon } from './ui';
import { workspaceDestination } from '../lib/workspace-navigation';

export function ConnectWalletScreen({ returnTo }: { returnTo: string }) {
  const session = useWorkspace();
  const router = useRouter();
  const ready = session.config.enabled && session.status === 'signedIn';

  useEffect(() => {
    if (ready) router.replace(workspaceDestination(returnTo));
  }, [ready, returnTo, router]);

  return <div className="flex min-h-dvh flex-col bg-canvas text-ink">
    <header className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-4 px-6 py-5 sm:px-10 lg:px-16">
      <Link href="/" aria-label="Pactra home" className="flex min-h-11 items-center text-2xl font-semibold tracking-[-1px] no-underline">PACTRA</Link>
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted no-underline hover:text-ink"><Icon name="arrow-left" />Back to home</Link>
    </header>
    <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-6 pt-8 pb-20 outline-none sm:pb-28">
      <section aria-labelledby="connect-title" className="w-full max-w-lg rounded-2xl border border-(--hairline) bg-(--surface-soft) px-6 py-10 text-center sm:px-12 sm:py-12">
        <div className="mx-auto mb-7 flex size-14 items-center justify-center rounded-2xl bg-card text-(--link)"><Icon name="wallet" className="size-7" /></div>
        <p className="mb-3 text-xs font-medium tracking-[0.16em] text-muted uppercase">Your Pactra workspace</p>
        <h1 id="connect-title" className="mb-4 font-serif text-4xl leading-tight tracking-[-0.03em] sm:text-5xl">Connect your wallet</h1>
        <p className="m-0 text-base leading-relaxed text-muted">Connect your wallet, then sign a message to access your agreements, reviews, and workspace.</p>
        {session.config.enabled && session.config.chain && <p className="mt-6 mb-0 inline-flex items-center gap-2 rounded-full border border-(--hairline) px-3 py-1.5 text-xs text-muted"><img src="/logo-bot.svg" alt="BOT Chain logo" width={14} height={14} className="size-3.5" />{session.config.chain.name} · BOT</p>}
        <div className="mt-8 flex justify-center text-left [&_button]:min-h-12">
          {ready ? <p role="status" className="text-sm text-muted">Opening your workspace…</p> : <WalletControl />}
        </div>
        {!session.config.enabled && <p role="status" className="mt-4 text-sm leading-relaxed text-muted">Wallet sign-in is currently unavailable. Please try again once network setup is complete.</p>}
        <p className="mt-8 mb-0 border-t border-(--hairline) pt-6 text-xs leading-relaxed text-muted">Signing in is free. It does not create an agreement or move funds.</p>
      </section>
    </main>
  </div>;
}
