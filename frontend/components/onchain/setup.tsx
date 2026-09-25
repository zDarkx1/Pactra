'use client';
import type { OnchainConfig } from '../../lib/onchain-types';
import { useTaskResource, TaskButton } from '../tasks/task-shared';
import styles from '../tasks/task-styles';
export function SettlementSetup() {
  const { data, loading, error, reload } = useTaskResource<OnchainConfig>('/onchain/config');
  return <section className={styles.setupPanel} aria-label="Settlement configuration"><h2>Onchain settlement</h2>
    <p role="status">{loading ? 'Checking deployment configuration…' : error ? 'Could not verify deployment configuration. Transactions are disabled.' : !data?.enabled ? 'No escrow contract is configured. Funding and settlement are disabled; unfunded review and nominated dispute evidence remain available.' : `Deployment configured on chain ${data.chain_id}. Each action still requires live contract verification.`}</p>
    {data?.enabled && <><code>{data.escrow_address}</code><p className={styles.hint}>Required confirmations: {data.confirmations}. Availability attestation: {data.attestation_available ? 'configured; each artifact is checked separately' : 'unavailable — onchain submission disabled'}.</p></>}
    {error != null && <TaskButton className={styles.secondary} onClick={() => void reload()}>Check setup again</TaskButton>}
  </section>;
}
