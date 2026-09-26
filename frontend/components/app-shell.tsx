"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { canAnimate, runMotion, type MotionHandle } from "../lib/motion";
import { useWorkspace } from "./workspace-provider";
import { WalletControl } from "./wallet-control";
import { WorkspaceGate } from "./workspace-gate";
import { Icon } from "./ui";
import { Dialog, Tooltip } from "radix-ui";
import { shellStyles as styles } from "./shell-styles";

const destinations = [
  { href: "/tasks", label: "Agreements", icon: "tasks" as const },
  { href: "/arbiter", label: "Arbiter workspace", icon: "tasks" as const, arbiterOnly: true },
  { href: "/checker", label: "JSON checker", icon: "checker" as const },
];

// Arbiter tools only make sense for wallets on the team arbiter allowlist.
// Everyone else works from Agreements and the public checker.
export function isArbiterWallet(config: { arbiters: string[] } | null, address: string | null): boolean {
  return !!address && !!config?.arbiters?.includes(address.toLowerCase());
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return <Link className={styles.wordmark} href="/" aria-label="Pactra home" title={compact ? "Pactra home" : undefined}>{compact ? <Icon name="home" /> : "Pactra"}</Link>;
}

function SidebarLink({href,label,icon,compact=false,current=false,className,onNavigate}:{href:string;label:string;icon:"tasks"|"checker"|"plus";compact?:boolean;current?:boolean;className:string;onNavigate?:(href:string)=>void}) {
  const content=<Link href={href} aria-label={compact?label:undefined} aria-current={current?"page":undefined} className={className} onClick={event=>{
      // Preserve normal anchors, modified clicks and Next client navigation.

      if(!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)onNavigate?.(href);
    }}><Icon name={icon}/><span className={compact?"sr-only":undefined}>{label}</span></Link>;
  return compact ? <Tooltip.Provider delayDuration={250}><Tooltip.Root><Tooltip.Trigger asChild>{content}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content side="right" sideOffset={12} className={styles.tooltip}>{label}</Tooltip.Content></Tooltip.Portal></Tooltip.Root></Tooltip.Provider> : content;
}
function Navigation({ onNavigate, compact = false, arbiterOnly = false }: { onNavigate?: (href: string) => void; compact?: boolean; arbiterOnly?: boolean }) {
  const pathname = usePathname();
  const visible = destinations.filter(destination => !destination.arbiterOnly || arbiterOnly);
  return <nav className={styles.navigation} aria-label="Workspace">{visible.map(({href,label,icon})=><SidebarLink key={href} href={href} label={label} icon={icon} className={styles.navigationLink} compact={compact} current={pathname===href||pathname.startsWith(`${href}/`)} onNavigate={onNavigate}/>)}</nav>;
}

function MobileNavigation() {
  const pathname = usePathname();
  const { address, config } = useWorkspace();
  const arbiter = isArbiterWallet(config, address);
  const panel = useRef<HTMLDivElement>(null);
  const motion = useRef<MotionHandle | null>(null);
  const backdropMotion = useRef<MotionHandle | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const phase = useRef<'closed' | 'open' | 'closing'>('closed');
  const pointerIntent = useRef(false);
  const focusDestination = useRef<string | null>(null);
  const focusFrame = useRef<number | null>(null);
  const [expanded, setExpanded] = useState(false);


  function focusMain() {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    // Run after Radix removes its focus scope and restores the trigger.
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
    // Keep Radix open throughout exit motion: focus trapping and scroll lock remain active.
    motion.current = runMotion(element, [from, { transform: 'translateX(-100%)', opacity: 0.8 }], { duration, easing, fill: 'both' }, finishClose);
  }
  function navigate(href: string, event?: MouseEvent<HTMLAnchorElement>) {
    if (event && (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    focusDestination.current = href !== pathname ? href : null;
    if (focusDestination.current) window.dispatchEvent(new CustomEvent('pactra:focus-main', { detail: href }));
    close(false);
  }
  function mountPanel(element: HTMLDivElement | null) {
    panel.current = element;
    if (!element) return;
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
  }
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
  return <Dialog.Root open={expanded} onOpenChange={open => {
    if (open) { phase.current = 'open'; setExpanded(true); }
    else close(pointerIntent.current);
  }}>
    <Dialog.Trigger asChild><button className={styles.menuButton} type="button" aria-label="Open navigation" onPointerDown={() => { pointerIntent.current = true; }} onKeyDown={() => { pointerIntent.current = false; }}><Icon name="menu" /></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} ref={backdrop} />
      <Dialog.Content className={`${styles.drawer} ${styles.dialog}`} ref={mountPanel} data-motion="instant" onEscapeKeyDown={event => { event.preventDefault(); close(false); }} onPointerDownOutside={event => { event.preventDefault(); close(true); }} onCloseAutoFocus={event => { if (focusDestination.current) event.preventDefault(); }}>
          <div className={styles.drawerHeader}><Dialog.Title>Workspace</Dialog.Title><button className={styles.iconButton} type="button" aria-label="Close navigation" autoFocus onClick={event => close(event.detail > 0)}><Icon name="close" /></button></div>
          <Dialog.Description className="sr-only">Navigate your agreements or open the public JSON checker.</Dialog.Description>
          <Navigation arbiterOnly={arbiter} onNavigate={href => navigate(href)} />
          <SidebarLink href="/tasks/new" label="New agreement" icon="plus" className={styles.sidebarCreate} onNavigate={href=>navigate(href)}/>
          <div className={styles.drawerFooter}><Link href="/" onClick={event => navigate('/', event)}>Back to Pactra <Icon name="arrow-up-right" /></Link><p>Private agreements. Inspectable evidence.<br />Settlement requires verified deployment.</p></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function PublicHeader() {
  return <header className={styles.publicHeader}><div className={styles.publicHeaderInner}><Wordmark /><nav className={styles.publicNavigation} aria-label="Main"><Link href="/#agreement">Agreements</Link><Link href="/checker">Checker</Link></nav><div className={styles.headerActions}><Link className={styles.headerWorkspace} href="/connect">Open workspace <Icon name="arrow-up-right" /></Link><MobileNavigation /></div></div></header>;
}

type AppShellProps = { children: ReactNode; title?: string; description?: string };

export default function AppShell(props: AppShellProps) {
  return <WorkspaceGate><WorkspaceShell {...props} /></WorkspaceGate>;
}

function WorkspaceShell({ children, title, description }: AppShellProps) {
  const { address, config } = useWorkspace();
  const arbiter = isArbiterWallet(config, address);
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
  const section = isChecker ? "JSON checker" : pathname.startsWith('/arbiter') ? 'Arbiter workspace' : "Agreements";
  const detail = pathname === "/tasks/new" ? "New agreement" : pathname.startsWith("/tasks/") ? "Agreement details" : null;
  return <div className={styles.shell} data-sidebar={collapsed ? "collapsed" : "expanded"} data-sidebar-motion={sidebarMotion}>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <aside id="workspace-sidebar" className={styles.sidebar} aria-label="Workspace sidebar"><div className={styles.sidebarSurface} aria-hidden="true" /><div className={styles.sidebarContent}><Wordmark compact={collapsed} /><div className={styles.workspaceLabel} aria-hidden={collapsed || undefined}>{collapsed ? ' ' : 'Workspace'}</div><Navigation compact={collapsed} arbiterOnly={arbiter} /><SidebarLink href="/tasks/new" label="New agreement" icon="plus" className={styles.sidebarCreate} compact={collapsed}/><div className={styles.sidebarNote} hidden={collapsed}><span className={styles.releaseLabel}><Icon name="info" />Current release</span><p>Agree on terms and check files. Onchain actions require verified deployment and wallet confirmation.</p><Link href="/">About Pactra <Icon name="arrow-up-right" /></Link></div></div></aside>
    <div className={styles.workspace} ref={workspaceElement}>
      <header className={styles.topbar}>
        <div className={styles.topbarLocation}><button className={styles.sidebarToggle} type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onClick={event => toggleSidebar(event.detail > 0)}><Icon name="panel-left" /></button><nav className={styles.desktopContext} aria-label="Breadcrumb"><span>Workspace</span><Icon name="chevron-right" />{detail ? <><Link href="/tasks">Agreements</Link><Icon name="chevron-right" /><span aria-current="page">{detail}</span></> : <span aria-current="page">{section}</span>}</nav></div>
        <div className={styles.mobileBrand}><Wordmark /></div>
        <div className={styles.headerActions}><WalletControl /><MobileNavigation /></div>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.main}>{(title || description) && <div className={styles.pageHeader}>{title && <h1>{title}</h1>}{description && <p>{description}</p>}</div>}{children}</main>
    </div>
  </div>;
}
