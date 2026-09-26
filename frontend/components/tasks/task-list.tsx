'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import { useWorkspace } from '../workspace-provider';
import { Icon } from '../ui';
import { createTaskPager, type TaskPagerSnapshot } from '../../lib/workspace-client';
import { taskMatchesSearch } from '../../lib/task-list';
import { TaskButton, SessionExpired, TaskLoading, TaskSession, TaskStatusBadge, TaskTime, taskDisplayStatus, taskErrorMessage, taskErrorStatus, useTaskClock } from './task-shared';
import shared from './task-styles';
import styles from './task-list-styles';

export default function TaskListView() {
  return <TaskSession><TaskList /></TaskSession>;
}

function TaskList() {
  const { address } = useWorkspace();
  const pager = useRef<ReturnType<typeof createTaskPager> | null>(null);
  const [{ data, error, loading, loadingMore }, setSnapshot] = useState<TaskPagerSnapshot>({ data: null, error: null, loading: true, loadingMore: false });
  useLayoutEffect(() => {
    const current = createTaskPager(() => setSnapshot(current.snapshot));
    pager.current = current;
    void current.reload();
    return () => { current.dispose(); pager.current = null; };
  }, []);
  const reload = () => pager.current?.reload();
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const now = useTaskClock();
  if (taskErrorStatus(error) === 401) return <SessionExpired />;
  const tasks = (data?.tasks ?? []).filter(task => [task.manifest.buyer, task.manifest.worker].some(party => party.toLowerCase() === address?.toLowerCase()));
  const visible = tasks.filter(task => (role === 'all' || task.manifest[role as 'buyer' | 'worker'].toLowerCase() === address?.toLowerCase()) && (status === 'all' || taskDisplayStatus(task, now) === status) && taskMatchesSearch(task, query));
  const hasFilters = role !== 'all' || status !== 'all' || query.trim() !== '';
  function clearFilters() {
    setRole('all');
    setStatus('all');
    setQuery('');
  }
  return <div className={styles.list}>
    <div className={styles.toolbar}>
      <p>Agreements where you are the buyer or worker.</p>
      <Link href="/tasks/new" className={[shared.primary, styles.newTask].join(' ')}><Icon name="plus" />New agreement</Link>
    </div>
    <div className={styles.filters} role="group" aria-label="Task filters">
      <label className={[styles.field, styles.search].join(' ')}>Search loaded tasks
        <span className={styles.searchInput}><Icon name="search" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, wallet or task ID" aria-describedby="task-list-scope" /></span>
      </label>
      <label className={styles.field}>Your role
        <select value={role} onChange={event => setRole(event.target.value)}><option value="all">Buyer and worker</option><option value="buyer">Buyer</option><option value="worker">Worker</option></select>
      </label>
      <label className={styles.field}>Status
        <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="invited">Awaiting acceptance</option><option value="expired">Expired</option><option value="accepted_unfunded">Accepted · awaiting funding</option><option value="cancelled">Cancelled</option></select>
      </label>
      <TaskButton type="button" className={[shared.secondary, styles.refresh].join(' ')} disabled={loading} aria-busy={loading} onClick={() => void reload()}><Icon name="refresh" />{loading && data ? 'Refreshing…' : 'Refresh list'}</TaskButton>
    </div>
    <div className={styles.scope}>
      <p id="task-list-scope">Search and filters apply to loaded tasks. Load more to include older agreements; refreshing starts again with the newest page.</p>
    </div>
    {error != null && <div className={[shared.errorBox, styles.error].join(' ')} role="alert"><strong>Could not load tasks</strong><p>{taskErrorMessage(error)}</p>{data && <p>The list shown is from the last successful read.</p>}<TaskButton type="button" className={shared.secondary} disabled={loading} onClick={() => void reload()}>Refresh from first page</TaskButton></div>}
    {loading && !data ? <TaskLoading /> : data && <section className="grid min-w-0 gap-4" aria-label="Loaded tasks" aria-busy={loading}>
      <div className={styles.results}>
        <p role="status" aria-live="polite">{loading ? loadingMore ? 'Loading older tasks…' : 'Refreshing tasks…' : visible.length + ' shown of ' + tasks.length + ' loaded'}</p>
        {hasFilters && visible.length > 0 && <TaskButton type="button" className={styles.clear} onClick={clearFilters}>Clear filters</TaskButton>}
      </div>
      {visible.length === 0 ? <div className={styles.empty}>
        <Icon name={tasks.length ? 'search' : 'tasks'} />
        <h2>{tasks.length ? 'No tasks match' : 'No agreements yet'}</h2>
        <p>{tasks.length ? 'Try another title, wallet or task ID, or clear your filters.' : 'Create a task as a buyer, or ask a buyer to invite this wallet as the worker.'}</p>
        {tasks.length > 0 ? <TaskButton type="button" className={shared.secondary} onClick={clearFilters}>Clear filters</TaskButton> : <Link className={shared.textLink} href="/tasks/new">Create your first agreement <Icon name="arrow-right" /></Link>}
      </div> : <>
        <div className={styles.columns} aria-hidden="true"><span>Agreement</span><span>Counterparty</span><span>Delivery deadline</span><span>Status / next step</span><span /></div>
        <ul className={styles.taskList}>{visible.map(task => {
          const isBuyer = task.manifest.buyer.toLowerCase() === address?.toLowerCase();
          const peer = isBuyer ? task.manifest.worker : task.manifest.buyer;
          const displayStatus = taskDisplayStatus(task, now);
          const nextAction = displayStatus === 'invited' ? (isBuyer ? 'Waiting for worker' : 'Review and accept') : displayStatus === 'expired' ? (isBuyer ? 'May be cancelled' : 'Acceptance unavailable') : displayStatus === 'accepted_unfunded' ? 'Open to verify chain state' : 'Invitation closed';
          return <li key={task.id}>
            <Link prefetch={false} className={styles.taskRow} href={'/tasks/' + task.id}>
              <div className={styles.taskSummary}><span className={styles.taskTitle}>{task.manifest.title}</span><span className={styles.meta}>You are the {isBuyer ? 'buyer' : 'worker'} · {task.manifest.deliverables.length} deliverable{task.manifest.deliverables.length === 1 ? '' : 's'}</span><span className={styles.meta}>ID <code title={task.id}>{task.id.slice(0, 8)}</code></span></div>
              <div className={styles.counterparty}><span className={styles.meta}>{isBuyer ? 'Worker' : 'Buyer'}</span><code title={peer}>{peer.slice(0, 8)}…{peer.slice(-6)}</code></div>
              <div className={styles.deadline}><span className={styles.mobileLabel}>Delivery deadline</span><TaskTime value={task.manifest.delivery_deadline} /></div>
              <div className={styles.rowStatus}><TaskStatusBadge task={task} now={now} /><span className={styles.meta}>{nextAction}</span></div>
              <Icon name="arrow-right" className={styles.rowArrow} />
            </Link>
          </li>;
        })}</ul>
      </>}
      {data.next_cursor && <TaskButton type="button" className={shared.secondary} disabled={loading} aria-busy={loadingMore} onClick={() => void pager.current?.loadMore()}>{loadingMore ? 'Loading more…' : 'Load more agreements'}</TaskButton>}
    </section>}
    <p className={styles.footnote}><Icon name="clock" /><span>Expiry labels use your device clock. The server decides whether an invitation can still be accepted. Acceptance does not fund a task.</span></p>
  </div>;
}
