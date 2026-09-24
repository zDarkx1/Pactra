"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Accordion, Dialog, NavigationMenu } from "radix-ui";
import { CaretDown, ArrowRight, List, X } from "@phosphor-icons/react";

const groups = [
  {
    label: "Product",
    items: [
      ["Workspace", "/tasks"],
      ["New agreement", "/tasks/new"],
      ["JSON checker", "/checker"],
    ],
  },
  {
    label: "Principles",
    items: [
      ["Clear agreements", "/#principles"],
      ["Human decisions", "/#principles"],
      ["Release boundaries", "/#release"],
    ],
  },
  {
    label: "Learn",
    items: [
      ["The Pactra story", "/journal/introducing-pactra"],
      ["How it works", "/#capabilities"],
      ["Review the evidence", "/checker"],
      [
        "Development docs",
        "https://github.com/zDarkx1/Pactra/tree/main/docs",
      ],
    ],
  },
];
const navLink =
  "flex min-h-11 items-center gap-2 px-3 text-[15px] text-ink no-underline hover:underline underline-offset-4 focus-visible:outline-2";
const summaries = {
  Product: [
    "A clearer place to work.",
    "Create a shared agreement, inspect localization files, and keep the decision human.",
  ],
  Principles: [
    "Evidence before assumptions.",
    "Explicit scope. Inspectable findings. No automated acceptance or payment.",
  ],
  Learn: [
    "Get to know Pactra.",
    "Explore the thinking, research, and implementation behind the project.",
  ],
};
const descriptions: Record<string, string> = {
  Workspace: "Review private, unfunded agreements.",
  "New agreement": "Set the scope before work begins.",
  "JSON checker": "Inspect keys, placeholders, and terms.",
  "Clear agreements": "Start with the same expectations.",
  "Human decisions": "Keep AI advice separate from acceptance.",
  "Release boundaries": "Understand what is and is not available.",
  "The Pactra story": "Read the project’s detailed introduction.",
  "How it works": "Follow scope, evidence, and agreement.",
  "Review the evidence": "Try the localization checker.",
  "Development docs": "Explore the repository documentation.",
};
type Navigate = (event: MouseEvent<HTMLAnchorElement>) => void;

function Dropdown({ group, navigate, dismiss }: { group: (typeof groups)[number]; navigate: Navigate; dismiss: () => void }) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <NavigationMenu.Item value={group.label} className="h-[68px]">
      <NavigationMenu.Trigger ref={trigger} className={navLink + " group h-full rounded-none border-0 bg-transparent font-normal data-[state=open]:text-[#a9583e]"}>
        {group.label}
        <CaretDown aria-hidden size={12} className="transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
      </NavigationMenu.Trigger>
      <NavigationMenu.Content
        data-mega-panel
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          trigger.current?.focus({ preventScroll: true });
          dismiss();
        }}
        onPointerDownOutside={(event) => {
          if (!trigger.current?.contains(event.target as Node)) dismiss();
        }}
        className="absolute inset-x-0 top-full z-30 max-h-[calc(100dvh-68px)] overflow-y-auto overscroll-contain border-y border-[var(--hairline)] bg-canvas shadow-[0_22px_36px_#14141312]"
      >
        <div className="motion-safe:animate-nav-panel-in mx-auto grid max-w-[1360px] grid-cols-[.9fr_1.5fr_.85fr] gap-8 px-10 py-10 xl:gap-10 xl:px-16">
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-wider text-muted">{group.label}</p>
            <p className="mb-4 font-serif text-3xl leading-tight">{summaries[group.label as keyof typeof summaries][0]}</p>
            <p className="m-0 text-sm leading-relaxed text-muted">{summaries[group.label as keyof typeof summaries][1]}</p>
          </div>
          <div className="grid grid-cols-2 content-start gap-3">
            {group.items.map(([label, href]) => (
              <NavigationMenu.Link key={label} asChild onSelect={(event) => event.preventDefault()}>
                <Link href={href} onClick={navigate} className="group min-h-11 rounded-xl p-4 text-ink no-underline transition-colors hover:bg-[#eee8dd] focus-visible:outline-2 focus-visible:outline-[#a9583e] motion-reduce:transition-none">
                  <span className="mb-2 flex items-center justify-between gap-3 text-base font-medium">
                    {label}<ArrowRight aria-hidden size={16} className="shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
                  </span>
                  <span className="block text-sm leading-relaxed text-muted">{descriptions[label]}</span>
                </Link>
              </NavigationMenu.Link>
            ))}
          </div>
          <NavigationMenu.Link asChild onSelect={(event) => event.preventDefault()}>
            <Link href="/journal/introducing-pactra" onClick={navigate} className="flex min-h-11 flex-col justify-between rounded-xl bg-[#e8dfd0] p-6 text-ink no-underline transition-colors hover:bg-[#dfd1bf] motion-reduce:transition-none">
              <span className="font-mono text-[11px] uppercase tracking-wider">Project notes</span>
              <span className="my-5 font-serif text-3xl leading-tight">A shared definition of <em>done.</em></span>
              <span className="flex items-center gap-3 text-xs">Read the story<ArrowRight aria-hidden size={16} /></span>
            </Link>
          </NavigationMenu.Link>
        </div>
      </NavigationMenu.Content>
    </NavigationMenu.Item>
  );
}

export const container =
  "mx-auto w-[calc(min(89.5rem,100vw)-clamp(2rem,1.08163rem+3.91837vw,5rem)*2)]";

/** One intentional anchor scroll, never a competing trigger-focus scroll. */
function visitAnchor(href: string) {
  const url = new URL(href, window.location.href);
  const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if (!target) return;
  if (window.location.hash !== url.hash) window.history.pushState(window.history.state, "", href);
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "auto" });
}

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const home = useRef<HTMLAnchorElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const destination = useRef<string | null>(null);

  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    const change = () => {
      if (mq.matches) setOpen(false);
      setActiveMenu("");
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);

  const navigate: Navigate = (event) => {
    // Leave new-tab, download and modified activations to the browser/Next Link.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = event.currentTarget.getAttribute("href")!;
    const url = new URL(href, window.location.href);
    const samePageAnchor = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && !!url.hash && !!document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (samePageAnchor) event.preventDefault();
    setActiveMenu("");
    if (open) {
      destination.current = samePageAnchor ? href : "navigation";
      setOpen(false);
      // Dialog's close autofocus runs after its focus trap and scroll lock unmount.
    } else if (samePageAnchor) {
      visitAnchor(href);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-canvas/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className={container + " flex h-[58px] items-center justify-between gap-4 lg:h-[68px]"}>
        <Link ref={home} href="/" aria-label="Pactra home" className="flex min-h-11 shrink-0 items-center text-2xl font-semibold tracking-[-1px] text-ink no-underline">PACTRA</Link>
        <NavigationMenu.Root aria-label="Main navigation" value={activeMenu} onValueChange={(value) => {
          // A pending pointer-leave timer must not dismiss keyboard-focused links.
          if (!value && document.activeElement?.closest("[data-mega-panel]")) return;
          setActiveMenu(value);
        }} delayDuration={120} skipDelayDuration={250} className="hidden lg:block [&>div]:!static">
          <NavigationMenu.List className="m-0 flex list-none items-center p-0">
            <Dropdown group={groups[0]} navigate={navigate} dismiss={() => setActiveMenu("")} />
            <NavigationMenu.Item>
              <NavigationMenu.Link asChild onSelect={(event) => event.preventDefault()}><Link className={navLink} href="/#principles" onClick={navigate}>Approach</Link></NavigationMenu.Link>
            </NavigationMenu.Item>
            <Dropdown group={groups[1]} navigate={navigate} dismiss={() => setActiveMenu("")} />
            <Dropdown group={groups[2]} navigate={navigate} dismiss={() => setActiveMenu("")} />
            <NavigationMenu.Item>
              <NavigationMenu.Link asChild onSelect={(event) => event.preventDefault()}><Link className={navLink} href="/#release" onClick={navigate}>Updates</Link></NavigationMenu.Link>
            </NavigationMenu.Item>
            <NavigationMenu.Item>
              <NavigationMenu.Link asChild onSelect={(event) => event.preventDefault()}>
                <Link href="/tasks" onClick={navigate} className="ml-3 flex min-h-11 items-center gap-5 rounded-lg bg-ink px-4 text-sm text-canvas no-underline transition-colors hover:bg-[#3d3d3a] motion-reduce:transition-none">Open Pactra<ArrowRight aria-hidden size={16} /></Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>

        </NavigationMenu.Root>
        <Dialog.Root open={open} onOpenChange={(next) => { if (next) destination.current = null; setOpen(next); }}>
          <Dialog.Trigger ref={trigger} onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); } }} aria-label="Open navigation" className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 lg:hidden"><List aria-hidden size={26} /></Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="motion-safe:data-[state=open]:animate-nav-fade-in motion-safe:data-[state=closed]:animate-nav-fade-out fixed inset-0 z-50 bg-ink/30" />
            <Dialog.Content
              aria-modal="true"
              onOpenAutoFocus={(event) => { event.preventDefault(); close.current?.focus({ preventScroll: true }); }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                const href = destination.current;
                destination.current = null;
                if (href && href !== "navigation") visitAnchor(href);
                else if (!href) (matchMedia("(min-width: 1024px)").matches ? home.current : trigger.current)?.focus({ preventScroll: true });
              }}
              className="motion-safe:data-[state=open]:animate-nav-drawer-in motion-safe:data-[state=closed]:animate-nav-drawer-out fixed inset-y-0 right-0 z-50 flex h-dvh w-[calc(100%-1rem)] max-w-md flex-col overflow-y-auto overscroll-contain bg-canvas pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] text-ink shadow-[-12px_0_40px_#14141318] outline-none"
            >
              <Dialog.Title className="sr-only">Main navigation</Dialog.Title>
              <Dialog.Description className="sr-only">Explore Pactra’s product, principles, and project resources.</Dialog.Description>
              <div className="sticky top-0 z-10 flex min-h-[58px] shrink-0 items-center justify-between gap-4 border-b border-[var(--hairline)] bg-canvas">
                <Link href="/" aria-label="Pactra home" onClick={navigate} className="flex min-h-11 items-center text-2xl font-semibold tracking-[-1px] text-ink no-underline">PACTRA</Link>
                <Dialog.Close ref={close} aria-label="Close navigation" className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0"><X aria-hidden size={26} /></Dialog.Close>
              </div>
              <nav aria-label="Mobile navigation">
                <Accordion.Root type="multiple">
                  {groups.map((group) => (
                    <Accordion.Item key={group.label} value={group.label} className="border-b border-[var(--hairline)]">
                      <Accordion.Header className="m-0">
                        <Accordion.Trigger className="group flex min-h-16 w-full items-center justify-between gap-4 border-0 bg-transparent px-0 text-left font-serif text-2xl font-normal">
                          {group.label}<CaretDown aria-hidden size={16} className="shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
                        </Accordion.Trigger>
                      </Accordion.Header>
                      <Accordion.Content data-nav-accordion className="overflow-hidden motion-safe:data-[state=open]:animate-nav-accordion-in motion-safe:data-[state=closed]:animate-nav-accordion-out"><div className="pb-4">
                        {group.items.map(([label, href]) => <Link key={label} href={href} onClick={navigate} className="flex min-h-11 items-center py-2 text-base text-ink no-underline hover:underline underline-offset-4">{label}</Link>)}
                      </div></Accordion.Content>
                    </Accordion.Item>
                  ))}
                </Accordion.Root>
                <Link href="/#principles" onClick={navigate} className="flex min-h-16 items-center border-b border-[var(--hairline)] font-serif text-2xl text-ink no-underline">Approach</Link>
                <Link href="/#release" onClick={navigate} className="flex min-h-16 items-center border-b border-[var(--hairline)] font-serif text-2xl text-ink no-underline">Updates</Link>
              </nav>
              <div className="mt-auto flex shrink-0 flex-col gap-3 pt-8">
                <Link href="/tasks" onClick={navigate} className="flex min-h-11 items-center justify-center rounded-lg bg-[#a9583e] px-5 py-3 text-center text-white no-underline">Open workspace</Link>
                <Link href="/checker" onClick={navigate} className="flex min-h-11 items-center justify-center rounded-lg border border-[var(--hairline)] px-5 py-3 text-center text-ink no-underline">Try the checker</Link>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
