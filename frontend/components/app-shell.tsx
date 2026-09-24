"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { canAnimate, runMotion, type MotionHandle } from "../lib/motion";
import { WalletControl } from "./wallet-control";
import { Icon } from "./ui";
import { Button as AriaButton, DialogTrigger, ModalOverlay, Modal, Dialog } from "react-aria-components";
import { shellStyles as styles } from "./shell-styles";

const destinations = [
  { href: "/tasks", label: "Agreements", icon: "tasks" as const },
  { href: "/checker", label: "JSON checker", icon: "checker" as const },
];

function Wordmark({ compact = false }: { compact?: boolean }) {
  return <Link className={styles.wordmark} href="/" aria-label="Pactra home" title={compact ? "Pactra home" : undefined}>{compact ? <Icon name="home" /> : "Pactra"}</Link>;
}

function Navigation({ onNavigate, compact = false }: { onNavigate?: (href: string) => void; compact?: boolean }) {
  const pathname = usePathname();
  return <nav className={styles.navigation} aria-label="Workspace">{destinations.map(({ href, label, icon }) => <Link key={href} href={href} className={styles.navigationLink} title={compact ? label : undefined} aria-label={compact ? label : undefined} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} onClick={event => { if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate?.(href); }}><Icon name={icon} /><span className={compact ? "sr-only" : undefined}>{label}</span></Link>)}</nav>;
}

function MobileNavigation() {
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const motion = useRef<MotionHandle | null>(null);
  const backdropMotion = useRef<MotionHandle | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const phase = useRef<'closed' | 'open' | 'closing'>('closed');
  const pointerIntent = useRef(false);
  const focusDestination = useRef<string | null>(null);
  const focusFrame = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const labelId = useId();
  const dialogId = useId();

  function focusMain() {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    // Run after RAC removes its focus scope and restores the trigger.
    focusFrame.current = requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus({ preventScroll: true });
      focusFrame.current = null;
    });
  }
  function finishClose() {
    motion.current?.cancel();
    backdropMotion.current?.cancel();
    phase.current = 'closed';
    setExpanded(false);
  }
  function close(pointer: boolean) {
    if (phase.current === 'closed') return;
    const element = panel.current;
    if (!element || !canAnimate(pointer, window.matchMedia('(prefers-reduced-motion: reduce)').matches, document.hidden)) {
      finishClose();
      return;
    }
    if (phase.current === 'closing') return;
    const style = getComputedStyle(element);
    const from = { transform: style.transform, opacity: style.opacity };
    motion.current?.cancel();
    backdropMotion.current?.cancel();
    phase.current = 'closing';
    element.dataset.state = 'closing';
    element.dataset.motion = 'pointer';
    const duration = Number.parseFloat(style.getPropertyValue('--duration-panel')) || 220;
    const easing = style.getPropertyValue('--ease-out').trim() || 'ease-out';
    if (backdrop.current) backdropMotion.current = runMotion(backdrop.current, [{ backgroundColor: 'rgb(20 20 19 / 36%)' }, { backgroundColor: 'rgb(20 20 19 / 0%)' }], { duration, easing, fill: 'both' });
    // Keep RAC open throughout exit motion: focus trapping and scroll lock remain active.
    motion.current = runMotion(element, [from, { transform: 'translateX(-100%)', opacity: 0.8 }], { duration, easing, fill: 'both' }, finishClose);
  }
  function navigate(href: string, event?: MouseEvent<HTMLAnchorElement>) {
    if (event && (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    focusDestination.current = href !== pathname ? href : null;
    if (focusDestination.current) window.dispatchEvent(new CustomEvent('pactra:focus-main', { detail: href }));
    close(false);
  }
  useLayoutEffect(() => {
    const element = panel.current;
    if (!expanded || !element) return;
    const animated = canAnimate(pointerIntent.current, window.matchMedia('(prefers-reduced-motion: reduce)').matches, document.hidden);
    element.dataset.state = 'open';
    element.dataset.motion = animated ? 'pointer' : 'instant';
    if (animated) {
      const style = getComputedStyle(element);
      const duration = Number.parseFloat(style.getPropertyValue('--duration-drawer')) || 260;
      const easing = style.getPropertyValue('--ease-drawer').trim() || 'ease-out';
      motion.current = runMotion(element, [{ transform: 'translateX(-100%)', opacity: 0.8 }, { transform: 'translateX(0)', opacity: 1 }], { duration, easing });
      if (backdrop.current) backdropMotion.current = runMotion(backdrop.current, [{ backgroundColor: 'rgb(20 20 19 / 0%)' }, { backgroundColor: 'rgb(20 20 19 / 36%)' }], { duration, easing });
    }
  }, [expanded]);
  useEffect(() => {
    if (phase.current !== 'closed') close(false);
    if (focusDestination.current === pathname) focusMain();
    focusDestination.current = null;
  }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    function settle() {
      if (desktop.matches && phase.current !== 'closed') {
        close(false);
        focusMain();
      } else if (reduced.matches || document.hidden) {
        if (panel.current) panel.current.dataset.motion = 'instant';
        if (phase.current === 'closing') finishClose();
        else { motion.current?.cancel(); backdropMotion.current?.cancel(); }
      }
    }
    function cancelFocusIntent() { focusDestination.current = null; }
    window.addEventListener('pointerdown', cancelFocusIntent, true);
    window.addEventListener('keydown', cancelFocusIntent, true);
    desktop.addEventListener('change', settle);
    reduced.addEventListener('change', settle);
    document.addEventListener('visibilitychange', settle);
    return () => {
      motion.current?.cancel();
      backdropMotion.current?.cancel();
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      window.removeEventListener('pointerdown', cancelFocusIntent, true);
      window.removeEventListener('keydown', cancelFocusIntent, true);
      desktop.removeEventListener('change', settle);
      reduced.removeEventListener('change', settle);
      document.removeEventListener('visibilitychange', settle);
    };
  }, []);
  return <DialogTrigger isOpen={expanded} onOpenChange={open => {
    if (open) { phase.current = 'open'; setExpanded(true); }
    else close(pointerIntent.current);
  }}>
    <AriaButton className={styles.menuButton} type="button" aria-label="Open navigation" aria-haspopup="dialog" aria-expanded={expanded} aria-controls={dialogId} onPressStart={event => { pointerIntent.current = event.pointerType !== 'keyboard' && event.pointerType !== 'virtual'; }}><Icon name="menu" /></AriaButton>
    <ModalOverlay className={styles.overlay} ref={backdrop} isDismissable render={domProps => <div {...domProps} onPointerDownCapture={() => { pointerIntent.current = true; }} onKeyDownCapture={() => { pointerIntent.current = false; }} />}>
      <Modal className={styles.drawer} ref={panel} data-state="open" data-motion="instant">
        <Dialog id={dialogId} className={styles.dialog} aria-labelledby={labelId}>
          <div className={styles.drawerHeader}><h2 id={labelId}>Workspace</h2><AriaButton className={styles.iconButton} type="button" aria-label="Close navigation" autoFocus onPress={event => close(event.pointerType !== 'keyboard' && event.pointerType !== 'virtual')}><Icon name="close" /></AriaButton></div>
          <Navigation onNavigate={href => navigate(href)} />
          <Link href="/tasks/new" className={styles.sidebarCreate} onClick={event => navigate('/tasks/new', event)}><Icon name="plus" />New agreement</Link>
          <div className={styles.drawerFooter}><Link href="/" onClick={event => navigate('/', event)}>Back to Pactra <Icon name="arrow-up-right" /></Link><p>Private agreements. Inspectable evidence.<br />No funds move in this release.</p></div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  </DialogTrigger>;
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
        <div className={styles.topbarLocation}><AriaButton className={styles.sidebarToggle} type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} render={domProps => <button {...domProps} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} />} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onPress={event => toggleSidebar(event.pointerType !== 'keyboard' && event.pointerType !== 'virtual')}><Icon name="panel-left" /></AriaButton><nav className={styles.desktopContext} aria-label="Breadcrumb"><span>Workspace</span><Icon name="chevron-right" />{detail ? <><Link href="/tasks">Agreements</Link><Icon name="chevron-right" /><span aria-current="page">{detail}</span></> : <span aria-current="page">{section}</span>}</nav></div>
        <div className={styles.mobileBrand}><Wordmark /></div>
        <div className={styles.headerActions}><WalletControl /><MobileNavigation /></div>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.main}>{(title || description) && <div className={styles.pageHeader}>{title && <h1>{title}</h1>}{description && <p>{description}</p>}</div>}{children}</main>
    </div>
  </div>;
}
