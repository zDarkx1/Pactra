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
function Dropdown({ group }: { group: (typeof groups)[number] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <div
      className="relative h-[68px]"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!ref.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          ref.current?.querySelector("button")?.focus();
        }
      }}
    >
      <Button
        aria-expanded={open}
        aria-controls={"nav-" + group.label}
        onPress={() => setOpen(!open)}
        className={
          navLink + " h-full border-0 rounded-none bg-transparent font-normal"
        }
      >
        {group.label}
        <CaretDown size={12} className={open ? "rotate-180" : ""} />
      </Button>
      {open && (
        <div
          id={"nav-" + group.label}
          className="absolute top-full left-1/2 z-30 w-[250px] -translate-x-1/2 rounded-2xl bg-[#faf9f5] p-6 shadow-[0_6px_24px_#14141314]"
        >
          {group.items.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="block py-1 font-serif text-lg text-ink no-underline hover:underline"
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
export const container =
  "mx-auto w-[calc(min(89.5rem,100vw)-clamp(2rem,1.08163rem+3.91837vw,5rem)*2)]";
export function LandingHeader() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(min-width: 1024px)");
    const change = () => {
      if (mq.matches) setOpen(false);
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
          <Dropdown group={groups[0]} />
          <Link className={navLink} href="/#principles">
            Approach
          </Link>
          <Dropdown group={groups[1]} />
          <Dropdown group={groups[2]} />
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
