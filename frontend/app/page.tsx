import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { LandingHeader } from "../components/landing-header";
import { ProductBanner } from "../components/product-banner";
import { LazyEvidence } from "../components/lazy-evidence";
import { HeadingEntrance } from "../components/heading-entrance";
import { LandingScroll } from "../components/landing-scroll";
const container = "mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16";
const link =
  "group inline-flex min-h-11 items-center gap-3 text-sm font-medium text-ink underline underline-offset-4 decoration-[var(--hairline)] hover:decoration-ink";
export const metadata: Metadata = {
  title: "Agree on what good looks like.",
  description: "Clear scope, inspectable evidence, human decisions.",
};
const steps = [
  {
    id: "01",
    title: "Define the scope.",
    text: "Source files, deliverables, review terms, and one invited worker. Put the expectations in writing before work begins.",
    href: "/tasks/new",
    label: "Create an agreement",
  },
  {
    id: "02",
    title: "Inspect the evidence.",
    text: "Check JSON keys, placeholders, required terms, and empty values. Find the exact difference, not just a score.",
    href: "/checker",
    label: "Open the checker",
  },
  {
    id: "03",
    title: "Accept the terms.",
    text: "The invited worker reviews and accepts the agreed scope. This release stops at an unfunded agreement—not a payment.",
    href: "/tasks",
    label: "Visit the workspace",
  },
];
export default function HomePage() {
  return (
    <div className="bg-canvas text-ink">
      <a
        className="sr-only z-50 rounded-b-lg bg-canvas p-4 focus:not-sr-only focus:fixed focus:top-0 focus:left-1/2"
        href="#main-content"
      >
        Skip to content
      </a>
      <LandingHeader />
      <LandingScroll />
      <HeadingEntrance />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section
          id="agreement"
          data-central-hero
          className={
            container +
            " relative flex min-h-[680px] flex-col items-center justify-center py-20 text-center lg:min-h-[760px] lg:py-24"
          }
        >
          <div
            aria-hidden="true"
            className="mb-8 flex items-center gap-4 text-[#a9583e]"
          >
            <span className="h-px w-12 bg-[#d8c5b8]" />
            <span className="h-3 w-3 rotate-45 border border-current" />
            <span className="h-px w-12 bg-[#d8c5b8]" />
          </div>
          <h1 className="mx-auto mb-7 max-w-[1040px] text-[clamp(3.15rem,7.5vw,7rem)] leading-[.99] font-medium tracking-[-.065em]">
            Good work starts
            <br />
            with{" "}
            <span className="font-serif font-normal italic tracking-[-.045em] text-[#a9583e]">
              shared clarity.
            </span>
          </h1>
          <p className="mx-auto mb-9 max-w-[560px] font-serif text-[clamp(1.2rem,2vw,1.5rem)] leading-[1.5] text-body">
            Agree on the scope. Inspect the evidence.
            <br className="hidden sm:block" /> Keep the final decision human.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            <Link
              href="/tasks"
              className="group inline-flex min-h-12 items-center gap-6 rounded-full bg-ink px-7 text-sm text-canvas no-underline transition-colors hover:bg-[#a9583e]"
            >
              Open workspace
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
              />
            </Link>
            <Link href="#try-a-check" className={link}>
              See a real check
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-4 text-[11px] tracking-wide text-muted">
            <span>01 / Clear terms</span>
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-[#c5b9ab]"
            />
            <span>02 / Shared evidence</span>
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full bg-[#c5b9ab]"
            />
            <span>03 / Human decisions</span>
          </div>
          <p className="mt-5 mb-0 text-xs text-muted">
            Localization JSON today. Unfunded agreements only.
          </p>
        </section>
        <ProductBanner />
        <section id="capabilities" className={container + " py-12 lg:py-20"}>
          <div className="grid gap-8 border-t border-[var(--hairline)] pt-8 lg:grid-cols-[1fr_2fr] lg:gap-20">
            <div>
              <p className="mb-4 font-mono text-[11px] tracking-[.12em] uppercase text-muted">
                The working agreement
              </p>
              <h2 className="max-w-xs font-serif text-4xl leading-[1.12] font-normal">
                One shared record.
                <br />
                No moving goalposts.
              </h2>
              <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted">
                A clear scope is a starting point—not a guarantee. Evidence
                makes the next conversation more specific.
              </p>
            </div>
            <ol className="m-0 list-none p-0">
              {steps.map((s) => (
                <li
                  key={s.id}
                  className="group grid grid-cols-[32px_1fr] gap-4 border-b border-[var(--hairline)] py-7 first:pt-0 sm:grid-cols-[48px_1fr] sm:gap-6"
                >
                  <span className="pt-2 font-mono text-xs text-[#a9583e]">
                    {s.id}
                  </span>
                  <div>
                    <h3 className="mb-3 text-2xl font-medium tracking-tight">
                      {s.title}
                    </h3>
                    <p className="mb-4 max-w-xl font-serif text-xl leading-[1.45] text-body">
                      {s.text}
                    </p>
                    <Link href={s.href} className={link}>
                      {s.label}
                      <ArrowUpRight
                        size={16}
                        className="transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none"
                      />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section id="try-a-check" className="my-8 bg-[#eee8dd] py-14 lg:py-20">
          <div
            className={
              container +
              " grid items-start gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20"
            }
          >
            <div>
              <p className="mb-5 font-mono text-[11px] tracking-[.12em] uppercase text-muted">
                Small detail. Real difference.
              </p>
              <h2 className="mb-6 max-w-sm font-serif text-[clamp(2.6rem,4vw,3.7rem)] leading-[1.05] font-normal tracking-tight">
                Don’t take
                <br />
                our word for it.
                <br />
                <span className="text-[#a9583e]">Check the work.</span>
              </h2>
              <p className="max-w-sm text-sm leading-relaxed text-body">
                A missing placeholder can change a working translation into a
                broken interface. Run this sample, inspect the finding, then
                restore what’s missing.
              </p>
              <Link href="/checker" className={link + " mt-5"}>
                Bring your own JSON
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="min-w-0 rounded-xl border border-[#d6cfc2] bg-canvas p-5 sm:p-8">
              <LazyEvidence />
            </div>
          </div>
        </section>
        <section
          id="principles"
          className={
            container +
            " grid gap-10 py-16 lg:grid-cols-[1.4fr_1fr] lg:gap-24 lg:py-24"
          }
        >
          <div>
            <p className="mb-6 font-mono text-[11px] tracking-[.12em] uppercase text-muted">
              A deliberate boundary
            </p>
            <h2 className="max-w-2xl font-serif text-[clamp(2.8rem,4.5vw,4rem)] leading-[1.08] font-normal tracking-tight">
              Tools can surface evidence.
              <br />
              <span className="text-[#a9583e]">People make the call.</span>
            </h2>
          </div>
          <div className="self-center">
            <p className="font-serif text-xl leading-relaxed">
              AI can help review meaning. It does not accept work, settle
              disputes, or authorize a payment. A successful check is
              evidence—not a verdict.
            </p>
            <aside
              id="release"
              className="mt-8 border-t border-[var(--hairline)] pt-5 text-sm leading-relaxed text-muted"
            >
              <strong className="block text-ink">
                Current release — unfunded agreements.
              </strong>
              Funding, payouts, disputes, and stored submissions are not
              available.
            </aside>
          </div>
        </section>
        <section
          id="journal"
          className={container + " pb-20 lg:pb-28"}
          aria-labelledby="journal-title"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-[var(--hairline)] pt-7 pb-8">
            <h2 id="journal-title" className="m-0 text-xl font-medium">
              From the Pactra journal
            </h2>
            <span className="font-mono text-[11px] tracking-wider uppercase text-muted">
              Ideas behind the product
            </span>
          </div>
          <Link
            href="/journal/introducing-pactra"
            className="group grid overflow-hidden rounded-xl bg-[#eee8dd] text-ink no-underline transition-colors hover:bg-[#e8e0d2] lg:grid-cols-[.7fr_1.3fr]"
          >
            <div
              aria-hidden="true"
              className="relative flex min-h-56 flex-col justify-between overflow-hidden bg-[#a9583e] p-8 text-canvas sm:p-10"
            >
              <span className="font-mono text-xs tracking-[.15em] uppercase">
                Pactra / Project notes
              </span>
              <span className="mt-12 font-serif text-6xl leading-[.95] tracking-tight sm:text-7xl">
                On the
                <br />
                <span className="italic">same page.</span>
              </span>
              <span className="mt-8 h-px w-full bg-white/40" />
            </div>
            <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
              <p className="mb-5 font-mono text-xs tracking-wider uppercase text-muted">
                Introducing Pactra
              </p>
              <h3 className="mb-5 max-w-xl font-serif text-[clamp(2rem,3.5vw,3.2rem)] leading-[1.08] font-normal tracking-tight group-hover:underline decoration-1 underline-offset-4">
                A shared definition of done.
              </h3>
              <p className="mb-8 max-w-xl font-serif text-xl leading-relaxed">
                Why clear scope comes first. What the checker actually proves.
                Where AI belongs—and why acceptance stays human. An in-depth
                look at the project, drawn from its documentation.
              </p>
              <span className="inline-flex min-h-11 items-center gap-4 text-sm font-medium">
                Read the project story
                <ArrowUpRight
                  size={18}
                  className="transition-transform group-hover:-translate-y-1 motion-reduce:transform-none"
                />
              </span>
            </div>
          </Link>
        </section>
      </main>
      <footer className="bg-ink py-10 text-canvas">
        <div className={container}>
          <div className="flex flex-col justify-between gap-7 border-b border-white/20 pb-9 sm:flex-row sm:items-center">
            <Link
              href="/"
              className="text-4xl font-semibold tracking-[-2px] text-canvas no-underline"
            >
              PACTRA<span className="text-[#cc785c]">.</span>
            </Link>
            <p className="m-0 font-serif text-2xl text-canvas">
              Start with clarity.
            </p>
          </div>
          <div className="flex flex-col justify-between gap-6 pt-7 sm:flex-row">
            <p className="m-0 text-xs text-[#b0aea5]">
              Built by allevi.dev. For work worth agreeing on.
            </p>
            <nav
              aria-label="Footer resources"
              className="flex flex-wrap gap-x-7 gap-y-3"
            >
              {[
                ["Workspace", "/tasks"],
                ["Checker", "/checker"],
                [
                  "Documentation",
                  "https://github.com/zDarkx1/Pactra/tree/interface/anthropic-landing/docs",
                ],
              ].map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="inline-flex min-h-11 items-center text-sm text-[#b0aea5] no-underline hover:text-canvas hover:underline"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
