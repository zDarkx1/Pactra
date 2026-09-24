import type { PublicWorkspaceConfig } from './workspace-types.ts';
import { walletAddressPattern } from './workspace-types.ts';

export function appOrigin(environment: Record<string, string | undefined> = process.env): URL {
  const origin = new URL(environment.PACTRA_APP_ORIGIN || (environment.NODE_ENV === 'production' ? '' : 'http://localhost:3000'));
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
    || !(origin.protocol === 'https:' || (environment.NODE_ENV !== 'production' && origin.protocol === 'http:' && origin.hostname === 'localhost'))) {
    throw new Error('Configure the public application origin.');
  }
  return origin;
}
function publicUrl(raw: string | undefined): string {
  const url = new URL(raw || '');
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)
    || (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Invalid public network URL.');
  return url.toString();
}
export function getPublicWorkspaceConfig(environment: Record<string, string | undefined> = process.env): PublicWorkspaceConfig {
  const disabled: PublicWorkspaceConfig = { enabled: false, reason: 'Wallet sign-in awaits team network configuration. The localization checker is available without a wallet.', chain: null, walletConnectProjectId: null, arbiters: [] };
  try {
    appOrigin(environment);
    const id = Number(environment.PACTRA_CHAIN_ID);
    const decimals = Number(environment.PACTRA_NATIVE_CURRENCY_DECIMALS);
    if (!Number.isSafeInteger(id) || id <= 0 || !environment.PACTRA_CHAIN_NAME?.trim()
      || !environment.PACTRA_NATIVE_CURRENCY_NAME?.trim() || !environment.PACTRA_NATIVE_CURRENCY_SYMBOL?.trim()
      || !environment.PACTRA_NATIVE_CURRENCY_DECIMALS || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return disabled;
    const arbiters = [...new Set((environment.PACTRA_ARBITERS || '').split(',').map(address => address.trim().toLowerCase()).filter(Boolean))];
    if (!arbiters.every(address => walletAddressPattern.test(address) && !/^0x0{40}$/.test(address))) return disabled;
    const projectId = environment.PACTRA_WALLETCONNECT_PROJECT_ID?.trim() || null;
    if (projectId && !/^[a-f0-9]{32}$/i.test(projectId)) return disabled;
    return { enabled: true, reason: null, walletConnectProjectId: projectId, arbiters,
      chain: { id, name: environment.PACTRA_CHAIN_NAME.trim(), rpcUrl: publicUrl(environment.PACTRA_RPC_URL),
        explorerUrl: environment.PACTRA_EXPLORER_URL ? publicUrl(environment.PACTRA_EXPLORER_URL) : null,
        nativeCurrency: { name: environment.PACTRA_NATIVE_CURRENCY_NAME.trim(), symbol: environment.PACTRA_NATIVE_CURRENCY_SYMBOL.trim(), decimals } } };
  } catch { return disabled; }
}
