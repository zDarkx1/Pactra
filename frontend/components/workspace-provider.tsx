'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { WagmiProvider, createConfig, http, useAccount, useDisconnect, useSignMessage } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { connectorsForWallets, lightTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { injectedWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import type { PublicWorkspaceConfig } from '../lib/workspace-types';
import { createSessionCleanupQueue } from '../lib/session-lifecycle';
import { setWorkspaceIdentity, workspaceRequest, WorkspaceError } from '../lib/workspace-client';

export type WorkspaceState = {
  status: 'loading' | 'signedOut' | 'signedIn'; address: string | null;
  config: PublicWorkspaceConfig; error: string | null; sessionKey: number;
  signing: boolean; signIn: () => Promise<void>; signOut: () => Promise<void>;
};
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace provider is missing.');
  return value;
}
function SessionController({ config, children, queryClient }: { config: PublicWorkspaceConfig; children: ReactNode; queryClient: QueryClient }) {
  const account = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const [session, setSession] = useState<{ address: string; walletKey: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [enqueueCleanup] = useState(createSessionCleanupQueue);
  const enqueueLogout = useCallback(() => enqueueCleanup(() => workspaceRequest<void>('/auth/logout', { method: 'POST', body: '{}', signal: AbortSignal.timeout(15000) })), [enqueueCleanup]);
  const walletKey = account.status === 'connected' ? account.address.toLowerCase() + ':' + account.chainId : '';
  const previousWallet = useRef('');
  const canSign = !!walletKey && account.chainId === config.chain?.id;
  const invalidate = useCallback(() => {
    generation.current += 1;
    active.current?.abort();
    setWorkspaceIdentity(null);
    setSession(null);
    setLoading(false);
    setSessionKey(value => value + 1);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    const changed = !!previousWallet.current && previousWallet.current !== walletKey;
    previousWallet.current = walletKey;
    invalidate();
    setError(null);
    const clean = changed ? enqueueLogout() : enqueueCleanup(async () => {});
    void clean.catch(() => setError('The previous session could not be revoked. Sign in again before continuing.'));
    if (!canSign || !account.address) return;
    const current = generation.current;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    const address = account.address.toLowerCase();
    void clean.then(async () => {
      if (controller.signal.aborted) return;
      try {
        const me = await workspaceRequest<{ address: string }>('/me', {
          signal: controller.signal,
          headers: { 'X-Pactra-Address': address, 'X-Pactra-Chain': String(config.chain!.id) },
        });
        if (current !== generation.current || controller.signal.aborted || me.address.toLowerCase() !== address) return;
        setWorkspaceIdentity({ address, chainId: config.chain!.id });
        setSession({ address, walletKey });
      } catch { } finally { if (current === generation.current) setLoading(false); }
    }).catch(() => { if (current === generation.current) setLoading(false); });
    return () => controller.abort();
  }, [walletKey, canSign, account.address, config.chain, invalidate, enqueueLogout, enqueueCleanup]);

  useEffect(() => {
    const expire = () => { invalidate(); setError('Your session expired. Sign in again.'); };
    window.addEventListener('pactra:session-expired', expire);
    return () => window.removeEventListener('pactra:session-expired', expire);
  }, [invalidate]);

  async function signIn() {
    if (!canSign || !account.address || busy.current) return;
    busy.current = true;
    invalidate();
    setSigning(true);
    setError(null);
    const current = generation.current;
    const address = account.address.toLowerCase();
    const controller = new AbortController();
    active.current = controller;
    try {
      await enqueueLogout();
      if (controller.signal.aborted) return;
      const challenge = await workspaceRequest<{ challenge_id: string; message: string; expires_at: string }>('/auth/challenge', { method: 'POST', body: JSON.stringify({ address }), signal: controller.signal });
      if (current !== generation.current || controller.signal.aborted) return;
      const signature = await signMessageAsync({ message: challenge.message });
      if (current !== generation.current || controller.signal.aborted) return;
      const verified = await workspaceRequest<{ address: string }>('/auth/verify', { method: 'POST', body: JSON.stringify({ challenge_id: challenge.challenge_id, signature }), signal: controller.signal });
      if (current !== generation.current || controller.signal.aborted) return;
      if (verified.address.toLowerCase() !== address) throw new Error('The signing account changed. Try again.');
      const restored = await workspaceRequest<{ address: string }>('/me', { signal: controller.signal, headers: { 'X-Pactra-Address': address, 'X-Pactra-Chain': String(config.chain!.id) } });
      if (current !== generation.current || controller.signal.aborted) return;
      if (restored.address.toLowerCase() !== address) throw new Error('The session account changed.');
      setWorkspaceIdentity({ address, chainId: config.chain!.id });
      setSession({ address, walletKey });
      setSessionKey(value => value + 1);
    } catch (cause) {
      if (current === generation.current && !controller.signal.aborted) {
        const rejected = cause instanceof Error && /reject|denied/i.test(cause.message);
        setError(rejected ? 'Signature declined. No task was accepted and no funds moved.' : cause instanceof WorkspaceError ? cause.message : 'Wallet sign-in failed. Check the selected account and try again.');
      }
    } finally {
      busy.current = false;
      setSigning(false);
    }
  }
  async function signOut() {
    if (busy.current) return;
    busy.current = true;
    invalidate();
    setSigning(true);
    setError(null);
    try { await enqueueLogout(); }
    catch (cause) { setError(cause instanceof WorkspaceError ? cause.message : 'Signed out of this view, but the server revocation is uncertain. Retry sign out to confirm.'); }
    finally { disconnect(); busy.current = false; setSigning(false); }
  }
  const authenticated = session && session.walletKey === walletKey && canSign;
  return <WorkspaceContext.Provider value={{ status: authenticated ? 'signedIn' : loading && canSign ? 'loading' : 'signedOut', address: authenticated ? session.address : null, config, error, sessionKey, signing, signIn, signOut }}>{children}</WorkspaceContext.Provider>;
}
function ConnectedWorkspace({ config, children }: { config: PublicWorkspaceConfig; children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  const [wagmiConfig] = useState(() => {
    const network = config.chain!;
    const chain = { id: network.id, name: network.name, nativeCurrency: network.nativeCurrency,
      rpcUrls: { default: { http: [network.rpcUrl] } }, ...(network.explorerUrl ? { blockExplorers: { default: { name: 'Explorer', url: network.explorerUrl } } } : {}) };
    const wallets = config.walletConnectProjectId ? [injectedWallet, walletConnectWallet] : [injectedWallet];
    const connectors = connectorsForWallets([{ groupName: 'Your wallets', wallets }], { appName: 'Pactra', projectId: config.walletConnectProjectId || '' });
    return createConfig({ chains: [chain], connectors, transports: { [chain.id]: http(network.rpcUrl) }, ssr: true });
  });
  const theme = lightTheme({ accentColor: '#cc785c', accentColorForeground: '#141413', borderRadius: 'medium', fontStack: 'system', overlayBlur: 'none' });
  theme.colors.modalBackground = '#faf9f5';
  theme.colors.modalText = '#141413';
  theme.colors.modalTextSecondary = '#65625c';
  theme.colors.actionButtonSecondaryBackground = '#efe9de';
  theme.fonts.body = 'IBM Plex Sans, system-ui, sans-serif';
  return <WagmiProvider config={wagmiConfig}><QueryClientProvider client={queryClient}><RainbowKitProvider theme={theme} modalSize="compact" showRecentTransactions={false} appInfo={{ appName: 'Pactra' }}><SessionController config={config} queryClient={queryClient}>{children}</SessionController></RainbowKitProvider></QueryClientProvider></WagmiProvider>;
}
export function WorkspaceProvider({ config, children }: { config: PublicWorkspaceConfig; children: ReactNode }) {
  if (!config.enabled || !config.chain) return <WorkspaceContext.Provider value={{ status: 'signedOut', address: null, config, error: null, sessionKey: 0, signing: false, signIn: async () => {}, signOut: async () => {} }}>{children}</WorkspaceContext.Provider>;
  return <ConnectedWorkspace config={config}>{children}</ConnectedWorkspace>;
}
