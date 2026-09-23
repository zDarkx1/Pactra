"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { canAnimate, runMotion, type MotionHandle } from "../lib/motion";
import { WalletControl } from "./wallet-control";
import { Icon } from "./ui";
import styles from "./shell.module.css";

const destinations = [
  { href: "/tasks", label: "Agreements", icon: "tasks" as const },
  { href: "/checker", label: "JSON checker", icon: "checker" as const },
];

function Wordmark({ compact = false }: { compact?: boolean }) {
  return <Link className={styles.wordmark} href="/" aria-label="Pactra home" title={compact ? "Pactra home" : undefined}>{compact ? <Icon name="home" /> : "Pactra"}</Link>;
}

function Navigation({ onNavigate, compact = false }: { onNavigate?: (href: string) => void; compact?: boolean }) {
  const pathname = usePathname();
  return <nav className={styles.navigation} aria-label="Workspace">{destinations.map(({ href, label, icon }) => <Link key={href} href={href} title={compact ? label : undefined} aria-label={compact ? label : undefined} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate?.(href); }}><Icon name={icon} /><span className={compact ? "sr-only" : undefined}>{label}</span></Link>)}</nav>;
}

function MobileNavigation() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const focusNextPage = useRef(false);
  const motion = useRef<MotionHandle | null>(null);
  const phase = useRef<'closed' | 'open' | 'closing'>('closed');
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const labelId = useId();
  const dialogId = useId();

  function navigate(href: string, event?: MouseEvent<HTMLAnchorElement>) {
    if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    focusNextPage.current = href !== pathname;
    if (focusNextPage.current) window.dispatchEvent(new CustomEvent('pactra:focus-main', { detail: href }));
    close(false);
  }
  function releaseScroll() {
    if (previousOverflow.current !== null) {
      document.documentElement.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }
  function finishClose() {
    motion.current?.cancel();
    motion.current = null;
    phase.current = 'closed';
    setExpanded(false);
    if (dialog.current) {
      dialog.current.dataset.state = 'closed';
      dialog.current.close();
    }
    releaseScroll();
    if (!focusNextPage.current) opener.current?.focus({ preventScroll: true });
  }
  function close(pointer: boolean) {
    if (phase.current === 'closed') return;
    const element = dialog.current;
    if (!element || !canAnimate(pointer, window.matchMedia('(prefers-reduced-motion: reduce)').matches, document.hidden)) {
      if (element) element.dataset.motion = 'instant';
      finishClose();
      return;
    }
    if (phase.current === 'closing') return;
    const style = getComputedStyle(element);
    const from = { transform: style.transform, opacity: style.opacity };
    motion.current?.cancel();
    phase.current = 'closing';
    element.dataset.state = 'closing';
    element.dataset.motion = 'pointer';
    motion.current = runMotion(element, [from, { transform: 'translateX(-100%)', opacity: 0.8 }], {
      duration: Number.parseFloat(style.getPropertyValue('--duration-panel')) || 220,
      easing: style.getPropertyValue('--ease-out').trim(), fill: 'both',
    }, finishClose);
  }
  function open(pointer: boolean) {
    const element = dialog.current;
    if (!element || phase.current !== 'closed') return;
    setFailed(false);
    const animated = canAnimate(pointer, window.matchMedia('(prefers-reduced-motion: reduce)').matches, document.hidden);
    element.dataset.motion = animated ? 'pointer' : 'instant';
    element.dataset.state = 'open';
    try { element.showModal(); } catch { setFailed(true); return; }
    previousOverflow.current = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    phase.current = 'open';
    setExpanded(true);
    if (animated) {
      const style = getComputedStyle(element);
      motion.current = runMotion(element, [{ transform: 'translateX(-100%)', opacity: 0.8 }, { transform: 'translateX(0)', opacity: 1 }], {
        duration: Number.parseFloat(style.getPropertyValue('--duration-drawer')) || 260,
        easing: style.getPropertyValue('--ease-drawer').trim(),
      });
    }
  }
  useEffect(() => {
    if (phase.current !== 'closed') close(false);
    if (focusNextPage.current) {
      focusNextPage.current = false;
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    function settle() {
      if (desktop.matches && phase.current !== 'closed') {
        focusNextPage.current = true;
        close(false);
        focusNextPage.current = false;
        document.getElementById('main-content')?.focus({ preventScroll: true });
      } else if (reduced.matches || document.hidden) {
        if (dialog.current) dialog.current.dataset.motion = 'instant';
        if (phase.current === 'closing') finishClose();
        else motion.current?.cancel();
      }
    }
    desktop.addEventListener('change', settle);
    reduced.addEventListener('change', settle);
    document.addEventListener('visibilitychange', settle);
    return () => {
      motion.current?.cancel();
      desktop.removeEventListener('change', settle);
      reduced.removeEventListener('change', settle);
      document.removeEventListener('visibilitychange', settle);
      dialog.current?.close();
      releaseScroll();
    };
  }, []);
  return <>
    <button ref={opener} className={styles.menuButton} type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={expanded} aria-controls={dialogId} onClick={event => open(event.detail !== 0)}><Icon name="menu" /></button>
    {failed && <p role="alert">Navigation could not open. <Link href="/tasks">Agreements</Link> · <Link href="/checker">Checker</Link></p>}
    <dialog id={dialogId} className={styles.drawer} ref={dialog} aria-labelledby={labelId} onCancel={event => { event.preventDefault(); close(false); }} onClose={() => { if (!dialog.current?.open && phase.current !== 'closed') finishClose(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(event.detail !== 0);
    }}>
      <div className={styles.drawerHeader}><h2 id={labelId}>Workspace</h2><button className={styles.iconButton} type="button" aria-label="Close navigation" autoFocus onClick={event => close(event.detail !== 0)}><Icon name="close" /></button></div>
      <Navigation onNavigate={href => navigate(href)} />
      <Link href="/tasks/new" className={styles.sidebarCreate} onClick={event => navigate('/tasks/new', event)}><Icon name="plus" />New agreement</Link>
      <div className={styles.drawerFooter}><Link href="/" onClick={event => navigate('/', event)}>Back to Pactra <Icon name="arrow-up-right" /></Link><p>Private agreements. Inspectable evidence.<br />No funds move in this release.</p></div>
    </dialog>
  </>;
}

export function PublicHeader() {
  return <header className={styles.publicHeader}><div className={styles.publicHeaderInner}><Wordmark /><nav className={styles.publicNavigation} aria-label="Main"><Link href="/#agreement">Agreements</Link><Link href="/checker">Checker</Link></nav><div className={styles.headerActions}><Link className={styles.headerWorkspace} href="/tasks">Open workspace <Icon name="arrow-up-right" /></Link><MobileNavigation /></div></div></header>;
}

export default function AppShell({ children, title, description }: { children: ReactNode; title?: string; description?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarMotion, setSidebarMotion] = useState<'instant' | 'pointer'>('instant');
  const workspaceElement = useRef<HTMLDivElement>(null);
  const shift = useRef<MotionHandle | null>(null);
  const previousLeft = useRef<number | null>(null);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('pactra:sidebar') === 'collapsed'); } catch {}
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = window.matchMedia('(min-width: 768px)');
    function settle() {
      if (reduced.matches || document.hidden || !desktop.matches) {
        shift.current?.cancel();
        previousLeft.current = null;
        setSidebarMotion('instant');
      }
    }
    reduced.addEventListener('change', settle);
    desktop.addEventListener('change', settle);
    document.addEventListener('visibilitychange', settle);
    return () => {
      shift.current?.cancel();
      reduced.removeEventListener('change', settle);
      desktop.removeEventListener('change', settle);
      document.removeEventListener('visibilitychange', settle);
    };
  }, []);
  useLayoutEffect(() => {
    const element = workspaceElement.current;
    const before = previousLeft.current;
    previousLeft.current = null;
    if (!element || before === null) return;
    const distance = before - element.getBoundingClientRect().left;
    if (Math.abs(distance) < 1) return;
    const style = getComputedStyle(element);
    shift.current = runMotion(element, [{ transform: 'translateX(' + distance + 'px)' }, { transform: 'translateX(0)' }], {
      duration: Number.parseFloat(style.getPropertyValue('--duration-drawer')) || 260,
      easing: style.getPropertyValue('--ease-drawer').trim(),
    });
  }, [collapsed]);
  function toggleSidebar(pointer: boolean) {
    const animated = canAnimate(pointer, window.matchMedia('(prefers-reduced-motion: reduce)').matches, document.hidden);
    previousLeft.current = animated ? workspaceElement.current?.getBoundingClientRect().left ?? null : null;
    shift.current?.cancel();
    setSidebarMotion(animated ? 'pointer' : 'instant');
    setCollapsed(value => !value);
    try { localStorage.setItem('pactra:sidebar', collapsed ? 'expanded' : 'collapsed'); } catch {}
  }
  const pathname = usePathname();
  const isChecker = pathname.startsWith("/checker");
  const section = isChecker ? "JSON checker" : "Agreements";
  const detail = pathname === "/tasks/new" ? "New agreement" : pathname.startsWith("/tasks/") ? "Agreement details" : null;
  return <div className={styles.shell} data-sidebar={collapsed ? "collapsed" : "expanded"} data-sidebar-motion={sidebarMotion}>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <aside id="workspace-sidebar" className={styles.sidebar} aria-label="Workspace sidebar"><div className={styles.sidebarSurface} aria-hidden="true" /><div className={styles.sidebarContent}><Wordmark compact={collapsed} /><div className={styles.workspaceLabel} aria-hidden={collapsed || undefined}>{collapsed ? ' ' : 'Workspace'}</div><Navigation compact={collapsed} /><Link href="/tasks/new" className={styles.sidebarCreate} title={collapsed ? 'New agreement' : undefined} aria-label={collapsed ? 'New agreement' : undefined}><Icon name="plus" /><span className={collapsed ? 'sr-only' : undefined}>New agreement</span></Link><div className={styles.sidebarNote} hidden={collapsed}><span className={styles.releaseLabel}><Icon name="info" />Current release</span><p>Agree on terms and check files. Funding and payouts are not available.</p><Link href="/">About Pactra <Icon name="arrow-up-right" /></Link></div></div></aside>
    <div className={styles.workspace} ref={workspaceElement}>
      <header className={styles.topbar}>
        <div className={styles.topbarLocation}><button className={styles.sidebarToggle} type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onClick={event => toggleSidebar(event.detail !== 0)}><Icon name="panel-left" /></button><nav className={styles.desktopContext} aria-label="Breadcrumb"><span>Workspace</span><Icon name="chevron-right" />{detail ? <><Link href="/tasks">Agreements</Link><Icon name="chevron-right" /><span aria-current="page">{detail}</span></> : <span aria-current="page">{section}</span>}</nav></div>
        <div className={styles.mobileBrand}><Wordmark /></div>
        <div className={styles.headerActions}><WalletControl /><MobileNavigation /></div>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.main}>{(title || description) && <div className={styles.pageHeader}>{title && <h1>{title}</h1>}{description && <p>{description}</p>}</div>}{children}</main>
    </div>
  </div>;
}
