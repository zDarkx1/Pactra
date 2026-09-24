import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { LandingHeader } from "../components/landing-header";
import { ProductBanner } from "../components/product-banner";
import LandingEvidence from "../components/landing-evidence";
import { LandingScroll } from "../components/landing-scroll";
const container = "mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-16";
const link =
  "group inline-flex min-h-11 items-center gap-3 text-sm font-medium text-ink underline underline-offset-4 decoration-[var(--hairline)] hover:decoration-ink";
export const metadata: Metadata = {
  title: "Agree on what good looks like.",
  description:
    "Clear scope, inspectable evidence, human decisions.",
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
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section
          id="agreement"
          className={
            container +
            " grid gap-12 pt-12 pb-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:pt-16 lg:pb-20"
          }
        >
          <div>

            <h1 className="mb-7 max-w-[620px] text-[clamp(3.1rem,5.4vw,5.1rem)] leading-[1.02] font-semibold tracking-[-.055em]">
              Agree on what
              <br />
              <span className="font-serif font-normal italic text-[#a9583e]">
                good
              </span>{" "}
              looks like.
            </h1>
            <p className="mb-8 max-w-[440px] font-serif text-[22px] leading-[1.45]">
              Less room for interpretation.
              <br />
              More room for good work. Bring the scope and its evidence into the
              same conversation.
            </p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
              <Link
                href="/tasks"
                className="group inline-flex min-h-12 items-center gap-5 rounded-lg bg-ink px-5 text-sm text-canvas no-underline transition-colors hover:bg-[#a9583e]"
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
            <p className="mt-6 mb-0 text-xs text-muted">
              Localization JSON today. Human decisions, always.
            </p>
          </div>
          <ProductBanner />
        </section>
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
              <LandingEvidence />
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
