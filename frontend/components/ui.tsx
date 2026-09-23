import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import styles from "./shell.module.css";

type IconName = "panel-left" | "home" | "arrow-left" | "arrow-right" | "arrow-up-right" | "arrow-down" | "tasks" | "checker" | "menu" | "close" | "check" | "info" | "plus" | "search" | "refresh" | "clock" | "wallet" | "lock" | "copy" | "chevron-right";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    "panel-left": <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" /></>,
    "arrow-left": <path d="M20 12H4m6-6-6 6 6 6" />,
    "arrow-right": <path d="M4 12h16m-6-6 6 6-6 6" />,
    "arrow-down": <path d="M12 4v16m-6-6 6 6 6-6" />,
    "arrow-up-right": <path d="M6 18 18 6M6 6h12v12" />,
    tasks: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2m6 2V2M9 10h6m-6 4h6m-6 4h3" /></>,
    checker: <><path d="m8 5-5 7 5 7m8-14 5 7-5 7m-3-8-2 16" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    wallet: <><path d="M20 8V5a1 1 0 0 0-1-1H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7" /><path d="M20 13h-5v4h5" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H4v13h4" /></>,
    "chevron-right": <path d="m9 5 7 7-7 7" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></>,
  };

  return <svg data-icon={name} className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

type ButtonVariant = "primary" | "secondary" | "quiet";

export function Button({ children, className, variant = "primary", pending = false, pendingLabel = "Working…", disabled, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; pending?: boolean; pendingLabel?: string }) {
  return (
    <button {...props} type={type} className={[styles.button, className].filter(Boolean).join(" ")} data-variant={variant} aria-busy={pending || undefined} disabled={disabled || pending}>
      <span className={styles.buttonContent} data-pending={pending || undefined}>
        <span className={styles.buttonLabel} aria-hidden={pending || undefined}>{children}</span>
        <span className={styles.pendingLabel} aria-hidden={!pending || undefined}>{pendingLabel}</span>
      </span>
    </button>
  );
}

export function ButtonLink({ children, className, variant = "primary", ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={[styles.button, className].filter(Boolean).join(" ")} data-variant={variant}><span className={styles.buttonContent}>{children}</span></Link>;
}

export function InlineAlert({ children, title, tone = "info" }: { children: ReactNode; title?: string; tone?: "info" | "error" | "success" | "warning" }) {
  return <div className={styles.alert} data-tone={tone} role={tone === "error" ? "alert" : "status"}><Icon name="info" /><div>{title && <strong>{title}</strong>}<div>{children}</div></div></div>;
}
