"use client";

import NextLink from "next/link";

import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

import { Sidebar, House, ArrowLeft, ArrowRight, ArrowUpRight, ArrowDown, ClipboardText, Code, List, X, Check, Info, Plus, MagnifyingGlass, ArrowsClockwise, Clock, Wallet, Lock, Copy, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { uiStyles as styles } from "./shell-styles";

type IconName = "panel-left" | "home" | "arrow-left" | "arrow-right" | "arrow-up-right" | "arrow-down" | "tasks" | "checker" | "menu" | "close" | "check" | "info" | "plus" | "search" | "refresh" | "clock" | "wallet" | "lock" | "copy" | "chevron-right";
const icons = {
  "panel-left": Sidebar, home: House, "arrow-left": ArrowLeft, "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight, "arrow-down": ArrowDown, tasks: ClipboardText,
  checker: Code, menu: List, close: X, check: Check, info: Info, plus: Plus,
  search: MagnifyingGlass, refresh: ArrowsClockwise, clock: Clock, wallet: Wallet,
  lock: Lock, copy: Copy, "chevron-right": CaretRight,
} as const;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const Glyph = icons[name];
  return <Glyph data-icon={name} className={className} size={20} weight="regular" aria-hidden="true" focusable="false" />;
}

type ButtonVariant = "primary" | "secondary" | "quiet";

export function Button({ children, className, variant = "primary", pending = false, pendingLabel = "Working…", disabled, type = "button", onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; pending?: boolean; pendingLabel?: string }) {
  const blocked = Boolean(disabled || pending);
  return (
    <button {...props} type={type} className={[styles.button, styles.variants[variant], className].filter(Boolean).join(" ")} data-variant={variant} aria-busy={pending || props['aria-busy'] || undefined} disabled={blocked}
      onClick={event => {
        if (blocked) { event.preventDefault(); return; }
        onClick?.(event);
      }}>
      <span className={`${styles.buttonContent} !grid`} data-pending={pending || undefined}>
        <span className={`${styles.label} ${pending ? 'invisible' : 'visible'}`} aria-hidden={pending || undefined}>{children}</span>
        <span className={`${styles.label} ${pending ? 'visible' : 'invisible'}`} aria-hidden={!pending || undefined}>{pendingLabel}</span>
      </span>
    </button>
  );
}

export function ButtonLink({ children, className, variant = "primary", href, onClick, legacyBehavior: _legacyBehavior, ...props }: ComponentProps<typeof NextLink> & { variant?: ButtonVariant }) {
  return <NextLink {...props} href={href} onClick={onClick} className={[styles.button, styles.variants[variant], className].filter(Boolean).join(" ")} data-variant={variant}>
    <span className={styles.buttonContent}>{children}</span>
  </NextLink>;
}

export function InlineAlert({ children, title, tone = "info" }: { children: ReactNode; title?: string; tone?: "info" | "error" | "success" | "warning" }) {
  return <div className={`${styles.alert} ${styles.tones[tone]}`} data-tone={tone} role={tone === "error" ? "alert" : "status"}><Icon name="info" /><div>{title && <strong>{title}</strong>}<div>{children}</div></div></div>;
}
