import { onWorkspaceIdentityChange } from './workspace-client.ts';
export type TransactionPhase = 'ready' | 'checking' | 'wallet' | 'pending' | 'confirming' | 'success' | 'rejected' | 'reverted' | 'uncertain' | 'blocked' | 'disposed';
export type TransactionSnapshot = { phase: TransactionPhase; hash: `0x${string}` | null };
type Operations = {
  validate: () => Promise<void>;
  send: () => Promise<`0x${string}`>;
  receipt: (hash: `0x${string}`) => Promise<{ status: 'success' | 'reverted'; transactionHash: `0x${string}` }>;
  readback: () => Promise<void>;
};
function rejected(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 8) return false;
  const value = error as { code?: number; name?: string; cause?: unknown };
  return value.code === 4001 || value.name === 'UserRejectedRequestError' || rejected(value.cause, depth + 1);
}
// One immutable consent intent. No automatic wallet retry, even after a network error.
export function createTransactionAttempt(changed: () => void) {
  let snapshot: TransactionSnapshot = { phase: 'ready', hash: null };
  let operations: Operations | null = null;
  let disposed = false, checkingReceipt = false;
  const dispose = () => { disposed = true; operations = null; snapshot = { phase: 'disposed', hash: null }; unsubscribe(); };
  const unsubscribe = onWorkspaceIdentityChange(dispose);
  const publish = (phase: TransactionPhase, hash = snapshot.hash) => { if (!disposed) { snapshot = { phase, hash }; changed(); } };
  async function checkReceipt() {
    if (disposed || checkingReceipt || !operations || !snapshot.hash || !['pending', 'uncertain'].includes(snapshot.phase)) return;
    checkingReceipt = true;
    publish('pending');
    try {
      const receipt = await operations.receipt(snapshot.hash);
      if (disposed) return;
      if (receipt.status === 'reverted') { publish('reverted', receipt.transactionHash); return; }
      publish('confirming', receipt.transactionHash);
      await operations.readback();
      if (!disposed) publish('success');
    } catch { publish('uncertain'); }
    finally { checkingReceipt = false; }
  }
  return {
    get snapshot() { return snapshot; },
    dispose,
    checkReceipt,
    async send(next: Operations) {
      if (snapshot.phase !== 'ready' || disposed) throw Error('This transaction intent has already been used.');
      operations = next;
      publish('checking');
      try { await next.validate(); } catch { publish('blocked'); return; }
      if (disposed) return;
      publish('wallet');
      try {
        const hash = await next.send();
        if (disposed) return;
        // checkReceipt owns the pending notification.
        snapshot = { phase: 'pending', hash };
        await checkReceipt();
      } catch (error) { publish(rejected(error) ? 'rejected' : 'uncertain'); }
    },
  };
}
