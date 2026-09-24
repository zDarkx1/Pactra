import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { LandingHeader } from "../components/landing-header";
import { ProductBanner } from "../components/product-banner";
import LandingEvidence from "../components/landing-evidence";
const container =
  "mx-auto w-[calc(min(89.5rem,100vw)-clamp(2rem,1.08163rem+3.91837vw,5rem)*2)]";
const gap = "gap-[clamp(1.75rem,1.67347rem+.32653vw,2rem)]";
export const metadata: Metadata = {
  title: "Clear agreements. Shared evidence.",
  description:
    "Private work agreements and evidence-linked localization review. Human decisions, with clear boundaries.",
};
const capabilities = [
  {
    title: "Start with an agreement",
    text: "Put the source, deliverables, review terms, and invited worker in one shared record before the work begins.",
    kind: "Agreements",
    state: "Available",
    detail: "Private workspace",
    href: "/tasks/new",
    cta: "Create an agreement",
  },
  {
    title: "Inspect every translation",
    text: "Compare source keys, placeholders, required terms, and empty values. Read the evidence behind each result before making a decision.",
    kind: "Localization",
    state: "Available",
    detail: "Deterministic checks",
    href: "/checker",
    cta: "Open the checker",
  },
  {
    title: "Keep decisions human",
    text: "AI can help review meaning. It does not accept work, settle disputes, or authorize a payment. Those boundaries stay explicit.",
    kind: "Product principles",
    state: "Advisory only",
    detail: "No automated payout",
    href: "#principles",
    cta: "Explore our approach",
  },
];
const resources = [
  ["Write down the acceptance criteria", "Agreements", "/tasks/new"],
  ["Review the same source snapshot", "Workspace", "/tasks"],
  ["Check keys and placeholders", "Localization", "/checker"],
  ["Separate advice from acceptance", "Principles", "#principles"],
  ["Understand the current release", "Development", "#release"],
  [
    "Read the development documentation",
    "Documentation",
    "https://github.com/zDarkx1/Pactra/tree/interface/anthropic-landing/docs",
  ],
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
      <main id="main-content" tabIndex={-1} className="outline-none">
        <section
          className={
            container + " pt-[88.875px] pb-[54px] lg:pt-[150.6px] lg:pb-[100px]"
          }
        >
          <div className={"grid " + gap + " lg:grid-cols-12 lg:items-end"}>
            <h1 className="m-0 text-[clamp(2.52rem,2.05rem+1.955vw,3.81rem)] leading-[1.1] font-bold tracking-[-.04em] lg:col-span-7">
              Work{" "}
              <Link
                href="/tasks"
                className="text-ink underline decoration-[3px] underline-offset-[5px] hover:decoration-[#cc785c]"
              >
                agreements
              </Link>{" "}
              and{" "}
              <Link
                href="/checker"
                className="text-ink underline decoration-[3px] underline-offset-[5px] hover:decoration-[#cc785c]"
              >
                evidence
              </Link>{" "}
              that put clarity at the center
            </h1>
            <p className="m-0 font-serif text-2xl leading-[1.4] lg:col-span-5 lg:pb-1">
              Good work begins with a shared understanding. Pactra brings clear
              terms and inspectable evidence together, so people can make
              informed decisions.
            </p>
          </div>
        </section>
        <div id="agreement" className={container}>
          <ProductBanner />
        </div>
        <section
          id="capabilities"
          className={container + " pt-[clamp(5.55rem,6vw,9.42rem)]"}
        >
          <h2 className="mb-8 text-2xl font-semibold">
            Build on clear foundations
          </h2>
          <div className={"grid lg:grid-cols-3 " + gap}>
            {capabilities.map((item) => (
              <article
                key={item.title}
                className="flex min-h-[520px] flex-col rounded-2xl bg-[#e8dfd0] p-[clamp(1.75rem,1.67347rem+.32653vw,2rem)] lg:min-h-[560px]"
              >
                <h3 className="mb-4 text-2xl leading-[1.3] font-semibold">
                  {item.title}
                </h3>
                <p className="mb-16 font-serif text-xl leading-[1.4]">
                  {item.text}
                </p>
                <dl className="mt-auto mb-8 text-sm">
                  {[
                    ["Status", item.state],
                    ["Category", item.kind],
                    ["Details", item.detail],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="flex min-h-12 items-center justify-between gap-4 border-b border-[#c9c0b1] first:border-t"
                    >
                      <dt className="font-mono text-xs uppercase">{k}</dt>
                      <dd className="m-0 text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
                <Link
                  href={item.href}
                  className="group flex min-h-11 w-fit items-center gap-4 rounded-lg bg-ink px-4 text-sm text-canvas no-underline transition-colors hover:bg-[#3d3d3a]"
                >
                  {item.cta}
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
                  />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section
          id="principles"
          className={container + " grid py-[90px] lg:grid-cols-3 " + gap}
        >
          <h2 className="max-w-[300px] text-2xl leading-[1.3] font-semibold">
            At Pactra, clear agreements come before confident decisions.
          </h2>
          <div className="lg:col-span-2">
            {resources.map(([title, kind, href]) => (
              <Link
                href={href}
                key={title}
                className="group flex min-h-14 flex-col justify-center gap-2 border-b border-[#d6d2c8] py-4 text-ink no-underline transition-colors hover:bg-[#efe9de] sm:flex-row sm:items-center sm:justify-between sm:py-3"
              >
                <span className="font-medium group-hover:underline">
                  {title}
                </span>
                <span className="shrink-0 text-sm text-muted">{kind}</span>
              </Link>
            ))}
          </div>
        </section>
        <section id="try-a-check" className={container + " mb-20"}>
          <details className="rounded-xl border border-[var(--hairline)] p-6">
            <summary className="cursor-pointer text-xl font-semibold">
              Try a real localization check
            </summary>
            <div className="mt-8 max-w-3xl">
              <LandingEvidence />
            </div>
          </details>
        </section>
        <aside
          id="release"
          className={
            container +
            " mb-20 border-t border-[var(--hairline)] pt-6 text-sm text-muted"
          }
        >
          <strong className="text-ink">
            Current release — unfunded agreements.
          </strong>{" "}
          Funding, payouts, disputes, and stored submissions are not available.
          The checker is not an acceptance or payment authorization.
        </aside>
      </main>
      <footer className="bg-ink py-20 text-canvas">
        <div
          className={
            container + " grid gap-12 lg:grid-cols-[1.3fr_repeat(4,1fr)]"
          }
        >
          <div className="flex flex-col justify-between gap-10">
            <Link
              href="/"
              className="text-3xl font-semibold tracking-[-1px] text-canvas no-underline"
            >
              PACTRA
            </Link>
            <p className="mb-0 text-xs text-[#b0aea5]">
              For work with a clear set of terms.
              <br />
              Built by allevi.dev.
            </p>
          </div>
          {[
            {
              title: "Product",
              links: [
                ["Workspace", "/tasks"],
                ["New agreement", "/tasks/new"],
                ["Localization checker", "/checker"],
              ],
            },
            {
              title: "Approach",
              links: [
                ["Clear scope", "#principles"],
                ["Shared evidence", "/checker"],
                ["Human decisions", "#principles"],
              ],
            },
            {
              title: "Resources",
              links: [
                [
                  "Documentation",
                  "https://github.com/zDarkx1/Pactra/tree/interface/anthropic-landing/docs",
                ],
                ["Source code", "https://github.com/zDarkx1/Pactra"],
                ["Current release", "#release"],
              ],
            },
            {
              title: "Get started",
              links: [
                ["Open Pactra", "/tasks"],
                ["Try a check", "/checker"],
                ["Back to top", "#main-content"],
              ],
            },
          ].map((group) => (
            <nav key={group.title} aria-label={"Footer " + group.title}>
              <h2 className="mb-6 text-xs font-medium text-canvas">
                {group.title}
              </h2>
              {group.links.map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  className="mb-3 block text-sm text-[#b0aea5] no-underline hover:text-canvas hover:underline"
                >
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </footer>
    </div>
  );
}
