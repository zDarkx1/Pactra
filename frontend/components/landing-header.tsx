"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  Dialog,
  DialogTrigger,
  Modal,
  ModalOverlay,
  Disclosure,
  DisclosurePanel,
  Heading,
} from "react-aria-components";
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
        "https://github.com/zDarkx1/Pactra/tree/interface/anthropic-landing/docs",
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
function Dropdown({
  group,
  activeMenu,
  setActiveMenu,
}: {
  group: (typeof groups)[number];
  activeMenu: string | null;
  setActiveMenu: (value: string | null) => void;
}) {
  const open = activeMenu === group.label;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMenu(null);
        ref.current?.querySelector("button")?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setActiveMenu(null);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, setActiveMenu]);
  return (
    <div
      ref={ref}
      className="h-[68px]"
      onMouseEnter={() => setActiveMenu(group.label)}
      onMouseLeave={() => {
        if (!ref.current?.contains(document.activeElement)) setActiveMenu(null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setActiveMenu(null);
      }}
    >
      <Button
        aria-expanded={open}
        aria-controls={"nav-" + group.label}
        onPress={(event) =>
          setActiveMenu(
            event.pointerType === "mouse"
              ? group.label
              : open
                ? null
                : group.label,
          )
        }
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveMenu(group.label);
            requestAnimationFrame(() =>
              ref.current
                ?.querySelector<HTMLAnchorElement>("[data-mega-panel] a")
                ?.focus(),
            );
          }
        }}
        className={
          navLink +
          " h-full border-0 rounded-none bg-transparent font-normal " +
          (open ? "text-[#a9583e]" : "")
        }
      >
        {group.label}
        <CaretDown
          size={12}
          className={
            "transition-transform duration-200 motion-reduce:transition-none " +
            (open ? "rotate-180" : "")
          }
        />
      </Button>
      <div
        id={"nav-" + group.label}
        data-mega-panel
        aria-hidden={!open}
        inert={!open}
        className={
          "absolute top-full left-0 right-0 z-30 border-y border-[var(--hairline)] bg-canvas shadow-[0_22px_36px_#14141312] transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none " +
          (open
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-3 opacity-0 pointer-events-none")
        }
      >
        <div className="mx-auto grid max-w-[1360px] grid-cols-[.9fr_1.5fr_.85fr] gap-10 px-16 py-10">
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-wider text-muted">
              {group.label}
            </p>
            <p className="mb-4 font-serif text-3xl leading-tight">
              {summaries[group.label as keyof typeof summaries][0]}
            </p>
            <p className="m-0 text-sm leading-relaxed text-muted">
              {summaries[group.label as keyof typeof summaries][1]}
            </p>
          </div>
          <div className="grid grid-cols-2 content-start gap-3">
            {group.items.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                onClick={() => setActiveMenu(null)}
                className="group rounded-xl p-4 text-ink no-underline transition-colors hover:bg-[#eee8dd] focus-visible:outline-2 focus-visible:outline-[#a9583e]"
              >
                <span className="mb-2 flex items-center justify-between gap-3 text-base font-medium">
                  {label}
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
                  />
                </span>
                <span className="block text-sm leading-relaxed text-muted">
                  {descriptions[label]}
                </span>
              </Link>
            ))}
          </div>
          <Link
            href="/journal/introducing-pactra"
            onClick={() => setActiveMenu(null)}
            className="flex flex-col justify-between rounded-xl bg-[#e8dfd0] p-6 text-ink no-underline transition-colors hover:bg-[#dfd1bf]"
          >
            <span className="font-mono text-[11px] uppercase tracking-wider">
              Project notes
            </span>
            <span className="my-5 font-serif text-3xl leading-tight">
              A shared definition of <em>done.</em>
            </span>
            <span className="flex items-center gap-3 text-xs">
              Read the story
              <ArrowRight size={16} />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
export const container =
  "mx-auto w-[calc(min(89.5rem,100vw)-clamp(2rem,1.08163rem+3.91837vw,5rem)*2)]";
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    const change = () => {
      if (mq.matches) setOpen(false);
      setActiveMenu(null);
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  return (
    <header className="sticky top-0 z-40 bg-canvas/95 backdrop-blur-sm">
      <div
        className={
          container + " flex h-[58px] items-center justify-between lg:h-[68px]"
        }
      >
        <Link
          href="/"
          aria-label="Pactra home"
          className="text-2xl font-semibold tracking-[-1px] text-ink no-underline"
        >
          PACTRA
        </Link>
        <nav
          aria-label="Main navigation"
          className="hidden items-center lg:flex"
        >
          <Dropdown
            group={groups[0]}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
          <Link className={navLink} href="/#principles">
            Approach
          </Link>
          <Dropdown
            group={groups[1]}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
          <Dropdown
            group={groups[2]}
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
          <Link className={navLink} href="/#release">
            Updates
          </Link>
          <Link
            href="/tasks"
            className="ml-3 flex min-h-11 items-center gap-5 rounded-lg bg-ink px-4 text-sm text-canvas no-underline transition-colors hover:bg-[#3d3d3a]"
          >
            Open Pactra
            <ArrowRight size={16} />
          </Link>
        </nav>
        <div className="lg:hidden">
          <DialogTrigger isOpen={open} onOpenChange={setOpen}>
            <Button
              aria-label="Open navigation"
              className="flex size-11 items-center justify-center border-0 bg-transparent p-0"
            >
              <List size={26} />
            </Button>
            <ModalOverlay
              isDismissable
              className="fixed inset-0 z-50 bg-canvas"
            >
              <Modal className="h-full overflow-auto">
                <Dialog
                  aria-label="Main navigation"
                  className="flex min-h-dvh flex-col outline-none"
                >
                  <div
                    className={
                      container +
                      " flex h-[58px] shrink-0 items-center justify-between"
                    }
                  >
                    <Link
                      href="/"
                      onClick={() => setOpen(false)}
                      className="text-2xl font-semibold text-ink no-underline"
                    >
                      PACTRA
                    </Link>
                    <Button
                      aria-label="Close navigation"
                      onPress={() => setOpen(false)}
                      className="flex size-11 items-center justify-center border-0 bg-transparent p-0"
                    >
                      <X size={26} />
                    </Button>
                  </div>
                  <div className="border-t border-[var(--hairline)]">
                    <div className={container}>
                      {groups.map((group) => (
                        <Disclosure
                          key={group.label}
                          className="border-b border-[var(--hairline)]"
                        >
                          <Heading>
                            <Button
                              slot="trigger"
                              className="group flex min-h-20 w-full items-center justify-between rounded-none border-0 bg-transparent px-0 text-2xl font-semibold"
                            >
                              {group.label}
                              <CaretDown
                                size={16}
                                className="group-aria-expanded:rotate-180"
                              />
                            </Button>
                          </Heading>
                          <DisclosurePanel className="pb-5">
                            {group.items.map(([label, href]) => (
                              <Link
                                key={label}
                                href={href}
                                onClick={() => setOpen(false)}
                                className="block py-2 font-serif text-xl text-ink no-underline"
                              >
                                {label}
                              </Link>
                            ))}
                          </DisclosurePanel>
                        </Disclosure>
                      ))}
                      <Link
                        href="/#release"
                        onClick={() => setOpen(false)}
                        className="flex min-h-20 items-center border-b border-[var(--hairline)] text-2xl font-semibold text-ink no-underline"
                      >
                        Updates
                      </Link>
                    </div>
                  </div>
                  <div
                    className={container + " mt-auto flex flex-col gap-4 py-8"}
                  >
                    <Link
                      href="/tasks"
                      onClick={() => setOpen(false)}
                      className="rounded-lg bg-[#a9583e] px-5 py-3 text-center text-white no-underline"
                    >
                      Open workspace
                    </Link>
                    <Link
                      href="/checker"
                      onClick={() => setOpen(false)}
                      className="rounded-lg border border-[var(--hairline)] px-5 py-3 text-center text-ink no-underline"
                    >
                      Try the checker
                    </Link>
                  </div>
                </Dialog>
              </Modal>
            </ModalOverlay>
          </DialogTrigger>
        </div>
      </div>
    </header>
  );
}
