'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useWorkspace } from './workspace-provider';
import { Icon } from './ui';
import styles from './wallet.module.css';

export function WalletControl() {
  const session = useWorkspace();
  if (!session.config.enabled) return <span className={styles.unconfigured} title={session.config.reason || undefined}><span aria-hidden="true" />Wallet setup pending</span>;
  return <div className={styles.wrapper}>
    <ConnectButton.Custom>{({ account, chain, mounted, openConnectModal, openChainModal, openAccountModal }) => {
      if (!mounted) return <button className={styles.button} disabled><span>Loading wallet…</span></button>;
      if (!account || !chain) return <button className={styles.button} onClick={openConnectModal}><span><Icon name="wallet" />Connect wallet</span></button>;
      if (chain.unsupported || chain.id !== session.config.chain?.id) return <button className={styles.button} onClick={openChainModal}><span>Switch network</span></button>;
      return <div className={styles.actions}>
        <button className={styles.account} onClick={openAccountModal} aria-label={'Wallet ' + account.address}><span><Icon name="wallet" />{account.displayName}</span></button>
        {session.status === 'signedIn'
          ? <button className={styles.account} onClick={() => void session.signOut()}><span>Sign out</span></button>
          : <button className={styles.button} disabled={session.signing || session.status === 'loading'} onClick={() => void session.signIn()}><span>{session.signing ? 'Confirm signature…' : session.status === 'loading' ? 'Checking session…' : 'Sign in'}</span></button>}
      </div>;
    }}</ConnectButton.Custom>
    {session.error && <p className={styles.error} role="alert">{session.error}<button className={styles.retry} onClick={() => void session.signOut()}>Clear session</button></p>}
  </div>;
}
