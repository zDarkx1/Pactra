'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWorkspace } from './workspace-provider';
import { Icon } from './ui';
import { Button as AriaButton } from 'react-aria-components';
import { walletStyles as styles } from './wallet-styles';

export function WalletControl() {
  const session = useWorkspace();
  if (!session.config.enabled) return <span className={styles.unconfigured} title={session.config.reason || undefined}><span aria-hidden="true" />Wallet setup pending</span>;
  return <div className={styles.wrapper}>
    <ConnectButton.Custom>{({ account, chain, mounted, openConnectModal, openChainModal, openAccountModal }) => {
      if (!mounted) return <AriaButton type="button" className={styles.button} isDisabled><span>Loading wallet…</span></AriaButton>;
      if (!account || !chain) return <AriaButton type="button" className={styles.button} onPress={openConnectModal}><span><Icon name="wallet" />Connect wallet</span></AriaButton>;
      if (chain.unsupported || chain.id !== session.config.chain?.id) return <AriaButton type="button" className={styles.button} onPress={openChainModal}><span>Switch network</span></AriaButton>;
      return <div className={styles.actions}>
        <AriaButton type="button" className={styles.account} onPress={openAccountModal} aria-label={'Wallet ' + account.address}><span><Icon name="wallet" />{account.displayName}</span></AriaButton>
        {session.status === 'signedIn'
          ? <AriaButton type="button" className={styles.account} onPress={() => void session.signOut()}><span>Sign out</span></AriaButton>
          : <AriaButton type="button" className={styles.button} isDisabled={session.signing || session.status === 'loading'} onPress={() => void session.signIn()}><span>{session.signing ? 'Confirm signature…' : session.status === 'loading' ? 'Checking session…' : 'Sign in'}</span></AriaButton>}
      </div>;
    }}</ConnectButton.Custom>
    {session.error && <p className={styles.error} role="alert">{session.error}<AriaButton type="button" className={styles.retry} onPress={() => void session.signOut()}>Clear session</AriaButton></p>}
  </div>;
}
