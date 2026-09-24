export function createSessionCleanupQueue() {
  let pending: Promise<void> = Promise.resolve();
  return (work: () => Promise<void>): Promise<void> => {
    const next = pending.catch(() => {}).then(work);
    pending = next;
    return next;
  };
}
