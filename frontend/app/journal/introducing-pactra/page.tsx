import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { LandingHeader } from "../../../components/landing-header";
export const metadata: Metadata = {
  title: "Introducing Pactra: a shared definition of done",
  description:
    "Why Pactra starts with clear scope, reproducible localization checks, and human decisions—and where its current release stops.",
};
import { projectEvidence } from "../../../lib/project-evidence";
import { HeadingEntrance } from "../../../components/heading-entrance";
function EvidenceCite({ n }: { n: number }) {
  return (
    <sup className="ml-1 font-sans text-xs">
      <a
        href={"#evidence-" + n}
        aria-label={"External evidence " + n}
        className="text-[#a9583e] underline"
      >
        [E{n}]
      </a>
    </sup>
  );
}
const sources = [
  ["PRODUCT.md", "Product scope and the acceptance problem"],
  ["CHECKER.md", "Deterministic checker specification"],
  ["PERSISTENT_BACKEND.md", "Persistent agreements and trust boundaries"],
  ["AZURE_AI.md", "Implemented semantic review and its limits"],
  ["AI_REVIEW.md", "AI review principles and future design"],
  ["SETTLEMENT_DECISIONS.md", "Proposed funding, revision, and dispute policy"],
  ["FRONTEND.md", "Current routes, session handling, and release gates"],
];
const toc = [
  ["why-pactra", "Why agreements need evidence"],
  ["shared-scope", "A shared starting point"],
  ["checking-work", "What the checker knows"],
  ["ai-boundary", "Where AI belongs"],
  ["settlement", "The settlement design"],
  ["current-release", "What exists today"],
  ["external-evidence", "External evidence"],
  ["sources", "Implementation notes"],
];
function Cite({ n }: { n: number }) {
  return (
    <sup className="ml-1 font-sans text-xs">
      <a
        href={"#source-" + n}
        aria-label={"Source " + n}
        className="text-[#a9583e] underline underline-offset-2"
      >
        [{n}]
      </a>
    </sup>
  );
}
const section = "scroll-mt-24 border-t border-[var(--hairline)] pt-10";
const h2 =
  "mb-6 font-serif text-[clamp(2rem,3vw,2.6rem)] leading-[1.12] font-normal tracking-tight text-ink";
export default function IntroducingPactra() {
  return (
    <div className="bg-canvas text-ink">
      <a
        href="#main-content"
        className="sr-only z-50 bg-canvas p-4 focus:not-sr-only focus:fixed focus:top-0"
      >
        Skip to article
      </a>
      <LandingHeader />
      <HeadingEntrance />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <article>
          <header className="mx-auto max-w-[1120px] px-6 pt-10 pb-12 sm:px-10 lg:pt-20 lg:pb-16">
            <Link
              href="/#journal"
              className="mb-12 inline-flex min-h-11 items-center gap-2 text-sm text-muted no-underline hover:text-ink hover:underline"
            >
              <ArrowLeft size={16} />
              Pactra journal
            </Link>
            <p className="mb-6 font-mono text-xs tracking-[.1em] uppercase text-[#a9583e]">
              Project notes / An introduction
            </p>
            <h1 className="mb-8 max-w-[950px] font-serif text-[clamp(3rem,6vw,5.8rem)] leading-[1.02] font-normal tracking-[-.04em]">
              A shared definition
              <br />
              of <em>done.</em>
            </h1>
            <p className="mb-8 max-w-[750px] font-serif text-[clamp(1.3rem,2vw,1.65rem)] leading-[1.45] text-body">
              Introducing Pactra: a place to agree on the work, inspect the
              evidence, and keep the final decision human.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--hairline)] pt-5 text-xs text-muted">
              <span>Pactra project notes</span>
              <span>Based on the repository documentation</span>
              <span>
                Current scope: unfunded agreements + localization checks
              </span>
            </div>
          </header>
          <div className="mx-auto grid max-w-[1120px] gap-10 px-6 pb-20 sm:px-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
            <aside className="min-w-0">
              <nav
                aria-label="In this article"
                className="border-t border-[var(--hairline)] pt-5 lg:sticky lg:top-24"
              >
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider">
                  In this article
                </h2>
                {toc.map(([id, label]) => (
                  <a
                    key={id}
                    href={"#" + id}
                    className="flex min-h-11 items-center py-2 text-sm leading-snug text-muted no-underline hover:text-ink hover:underline"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </aside>
            <div className="min-w-0 space-y-12 font-serif text-[20px] leading-[1.7] text-body [&_p]:mb-6 [&_li]:mb-3">
              <section id="why-pactra" className={section}>
                <h2 className={h2}>Why start with written terms?</h2>
                <p>
                  NYC’s Department of Consumer and Worker Protection requires
                  covered freelance contracts worth $800 or more to be written
                  and specify work, pay, and payment date.
                  <EvidenceCite n={1} /> This is a jurisdiction-specific example
                  of why explicit terms matter—not a claim that Pactra complies
                  with that law or that the rule applies everywhere.
                </p>
                <p>
                  A buyer and a freelancer can look at the same finished work
                  and see different things. One sees a missing requirement; the
                  other sees a new request. When the original agreement is
                  vague, acceptance becomes a negotiation after the effort has
                  already been spent. A problem in one deliverable can also hold
                  up an entire payment.
                </p>
                <p>
                  Pactra starts from that problem—not from the idea that adding
                  AI or escrow automatically makes work fair. Its product
                  hypothesis is a more symmetric, reproducible acceptance
                  process: the worker sees the same criteria as the buyer before
                  work begins, and both can inspect the evidence behind a
                  finding. New requirements should be distinguishable from
                  defects against the agreed scope.
                  <Cite n={1} />
                </p>
                <p>
                  The first domain is deliberately narrow: flat JSON
                  localization files. That gives the project a concrete source,
                  a concrete submission, and objective properties it can
                  actually check. It is not a universal evaluator for every kind
                  of freelance work.
                </p>
              </section>
              <section id="shared-scope" className={section}>
                <h2 className={h2}>Agree on the same starting point.</h2>
                <p>
                  The central idea is an acceptance manifest: a shared record of
                  the source snapshot, deliverables, rules, allocations,
                  deadlines, and review policy. Instead of relying on an
                  informal interpretation of “finished,” the parties review the
                  same version of the terms.
                  <Cite n={1} />
                </p>
                <p>
                  The persistent workspace already supports a buyer inviting one
                  designated worker by wallet address. The worker reviews and
                  accepts the immutable agreement before any proposed funding
                  step. This is not a public, open-claim marketplace. Accepted
                  agreements cannot be edited or reassigned in place, and the
                  recorded state ends at{" "}
                  <code className="break-all font-mono text-base">
                    accepted_unfunded
                  </code>
                  .<Cite n={3} />
                </p>
                <p>
                  The record includes per-deliverable amounts, revision limits,
                  and review windows. Recording those terms does not execute
                  them financially. A manifest fingerprint identifies the agreed
                  application version; it is not a completed smart-contract
                  commitment format or an authorization to move money.
                </p>
                <p>
                  Wallet sign-in establishes control of a signing key, not a
                  person’s legal identity. The workspace enforces participant
                  access, and real task creation requires valid network
                  configuration and team-approved arbiter identities. Missing
                  configuration is a gate, not a reason to invent a working
                  agreement.
                  <Cite n={3} />
                  <Cite n={7} />
                </p>
              </section>
              <section id="checking-work" className={section}>
                <h2 className={h2}>A check should explain what changed.</h2>
                <p>
                  W3C Internationalization guidance explains that composite
                  messages can fail across languages because sentence structure
                  and grammatical agreement differ.
                  <EvidenceCite n={2} /> That supports a distinction between
                  structural checks and linguistic judgment; it does not certify
                  this checker or establish that flat JSON is the best market
                  entry point.
                </p>
                <p>
                  The deterministic checker accepts flat JSON objects with
                  string values. It compares the source with a submission and
                  returns ordered, per-key findings. Its current version,{" "}
                  <code className="font-mono text-base">localization-v1</code>,
                  checks four concrete properties:
                  <Cite n={2} />
                </p>
                <ol className="list-decimal space-y-4 pl-6">
                  <li>
                    <strong>Key parity.</strong> Every source key must be
                    present, and extra submission keys fail the check.
                    Reordering JSON keys does not change the result.
                  </li>
                  <li>
                    <strong>Nonblank values.</strong> A submitted string must
                    contain more than whitespace.
                  </li>
                  <li>
                    <strong>Placeholder preservation.</strong> When enabled,
                    matching identifier placeholders such as{" "}
                    <code className="font-mono text-base">{"{name}"}</code> must
                    occur the same number of times in both values.
                  </li>
                  <li>
                    <strong>Required terms.</strong> If a source value contains
                    an exact configured term, the corresponding submission must
                    preserve that term. This is case-sensitive substring
                    matching—not a translation glossary.
                  </li>
                </ol>
                <figure className="my-8 rounded-lg bg-[#eee8dd] p-5 sm:p-7">
                  <figcaption className="mb-5 font-sans text-xs uppercase tracking-wider text-muted">
                    Synthetic example / Missing placeholder
                  </figcaption>
                  <dl className="space-y-4">
                    <div>
                      <dt className="font-sans text-xs text-muted">Source</dt>
                      <dd className="m-0 break-words font-mono text-base">
                        {"Hello, {name}."}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-sans text-xs text-muted">
                        Submission
                      </dt>
                      <dd className="m-0 font-mono text-base">Halo.</dd>
                    </div>
                  </dl>
                  <p className="mt-5 mb-0! font-sans text-sm leading-relaxed">
                    The translation has text, but the placeholder is missing.
                    Restoring it can resolve that finding; it does not prove
                    that the translation is good.
                  </p>
                </figure>
                <p>
                  The supported placeholder grammar is intentionally limited.
                  The checker does not claim support for ICU MessageFormat,
                  nested braces, HTML, or{" "}
                  <code className="font-mono text-base">%s</code> formatting. It
                  also does not determine semantic equivalence, identify
                  languages, detect plagiarism, or make legal or medical
                  judgments. A rule change needs a new checker version rather
                  than silently changing what an accepted rule means.
                  <Cite n={2} />
                </p>
                <p>
                  Running the standalone checker does not create a task, store
                  an artifact, call an AI provider, or approve a payment. A
                  green result means that the implemented checks passed—nothing
                  more.
                  <Cite n={1} />
                  <Cite n={4} />
                </p>
                <Link
                  href="/#try-a-check"
                  className="inline-flex min-h-11 items-center gap-3 font-sans text-sm font-medium text-[#a9583e] underline underline-offset-4"
                >
                  Try the real sample
                  <ArrowRight size={16} />
                </Link>
              </section>
              <section id="ai-boundary" className={section}>
                <h2 className={h2}>AI advises. It does not accept.</h2>
                <p>
                  NIST’s Generative AI Profile describes confabulation as
                  confidently presented erroneous or false content and warns
                  about users acting on it in consequential decisions.
                  <EvidenceCite n={3} /> Keeping AI advisory is our design
                  response, not a NIST endorsement. Human reviewers can also be
                  wrong.
                </p>
                <p>
                  Some differences are structural; others are about meaning.
                  “Payment is pending” and “payment succeeded” could both be
                  nonempty strings with matching keys, while still communicating
                  different facts. Pactra separates those questions rather than
                  pretending one test answers both.
                </p>
                <p>
                  An optional Azure semantic review integration is implemented
                  for local development. It is a separate request from the
                  deterministic check and requires explicit consent before
                  sending the source and submission to the provider. Findings
                  include the key, an assessment, exact source and submission
                  excerpts, and an explanation. Editing the input clears the old
                  review and consent.
                  <Cite n={4} />
                </p>
                <p>
                  The server rejects invented excerpts and missing, duplicate,
                  or unknown keys in a review response. That verifies
                  correspondence with the supplied text—not the truth of the
                  model’s reasoning. A model can still be wrong even when its
                  quotation is accurate. On timeout or invalid output, the
                  application reports unavailability instead of fabricating a
                  successful review.
                </p>
                <p>
                  AI does not invent binding criteria, accept work, sign
                  transactions, resolve disputes, or authorize payouts. Criteria
                  drafting and amendment or dispute assistance remain future
                  designs. The production frontend deliberately blocks AI review
                  until authentication and durable spend controls are ready;
                  provider calls may cost money. The implemented adapter is not
                  a claim of a safely launched public AI service.
                  <Cite n={5} />
                  <Cite n={7} />
                </p>
              </section>
              <section id="settlement" className={section}>
                <h2 className={h2}>
                  The payment design is a plan, not a live promise.
                </h2>
                <p>
                  The intended workflow connects clearer agreements to
                  per-deliverable settlement. After the worker accepts, the
                  buyer would fund the entire task upfront. Each deliverable
                  would retain its own allocation, so accepting one result would
                  not require accepting everything. This financial workflow is{" "}
                  <strong>not implemented</strong>.<Cite n={6} />
                </p>
                <p>
                  The agreed product direction also sets revision limits before
                  funding. Requests outside the accepted scope require a
                  separate amendment rather than becoming unlimited free
                  revisions. The procedure for exhausting revisions and some
                  deadline behavior still need to be finalized.
                </p>
                <p>
                  Buyer silence is not proof of quality. Under the proposed
                  policy, a review window would start only once a submission is
                  recorded and its artifact is accessible to the buyer. If the
                  buyer does not respond and no dispute blocks the allocation,
                  the worker could submit a claim transaction after the
                  deadline. A smart contract does not wake itself up or send
                  that transaction automatically. How artifact access is
                  evidenced remains an unresolved design question.
                </p>
                <p>
                  Disputes would go to an agreed human arbiter, with a named
                  backup—not an AI agent. The proposed primary decision window
                  is 48 hours from dispute opening, followed by 48 hours for the
                  backup from recorded handover. The handover must revoke the
                  primary’s authority. Backup inactivity, conflicts of interest,
                  and who triggers transitions still require explicit answers.
                  Human arbitration is a trust assumption, not trustless
                  adjudication.
                  <Cite n={6} />
                </p>
                <p>
                  No funds should be accepted on the strength of this
                  description. Reviewed contracts, unit and invariant testing, a
                  real two-wallet testnet flow, completed exit policies, and
                  explicit approval are release gates—not details to fill in
                  after launch.
                </p>
              </section>
              <section id="current-release" className={section}>
                <h2 className={h2}>What you can use—and what you cannot.</h2>
                <p>
                  The repository contains a Next.js frontend and a Go backend: a
                  standalone localization checker, wallet-authenticated private
                  agreement routes, immutable acceptance, and the optional
                  local-development semantic review integration. The frontend
                  includes agreement listing, creation, and detail routes, with
                  configuration and sign-in gates rather than fictional data.
                  <Cite n={3} />
                  <Cite n={7} />
                </p>
                <p>
                  It does not provide funded-work submissions, artifact storage,
                  escrow, payouts, dispute execution, or timeout claims. Public
                  deployment also requires security and operational checks
                  beyond a successful build. A working screen is not proof that
                  money is protected.
                </p>
                <p>
                  Pactra’s contribution is a product hypothesis worth testing:
                  put the terms before the work, let both sides inspect the same
                  evidence, and keep acceptance distinct from a checker result.
                  Hashes establish correspondence, not quality. Signatures
                  establish key control, not legal identity. Evidence makes
                  decisions better informed; it does not remove the need to make
                  them.
                  <Cite n={1} />
                </p>
                <Link
                  href="/checker"
                  className="inline-flex min-h-12 items-center gap-4 rounded-lg bg-ink px-5 font-sans text-sm text-canvas no-underline hover:bg-[#a9583e]"
                >
                  Explore the checker
                  <ArrowRight size={16} />
                </Link>
              </section>
              <section id="external-evidence" className={section}>
                <h2 className={h2}>External evidence. Explicit limits.</h2>
                <p>
                  These primary sources support the problem framing and risk
                  boundaries. They do not prove that Pactra reduces disputes,
                  speeds payment, improves translation quality, or guarantees
                  enforceability. Those outcomes require interviews,
                  independently reviewed test cases, and a measured pilot—not
                  stronger marketing language.
                </p>
                <ol className="list-none p-0 font-sans text-sm">
                  {projectEvidence.map((s) => (
                    <li
                      key={s.id}
                      id={"evidence-" + s.id}
                      className="scroll-mt-24 border-b border-[var(--hairline)] py-5"
                    >
                      <a href={s.url} className="text-ink underline">
                        [E{s.id}] {s.title}
                      </a>
                      <blockquote className="mx-0 mt-3 text-sm leading-relaxed text-muted">
                        “{s.quote}”
                      </blockquote>
                    </li>
                  ))}
                </ol>
              </section>
              <section id="sources" className={section}>
                <h2 className={h2}>From the project documentation.</h2>
                <p className="font-sans text-sm leading-relaxed text-muted">
                  This article is an editorial explanation of the repository
                  docs, not a new settlement policy. Where older starter notes
                  differ from later implementation updates, the later workspace
                  and frontend status notes take precedence. Repository access
                  may be required to open these sources.
                </p>
                <ol className="list-none space-y-4 p-0 font-sans text-sm">
                  {sources.map(([file, label], i) => (
                    <li
                      key={file}
                      id={"source-" + (i + 1)}
                      className="scroll-mt-24"
                    >
                      <a
                        href={
                          "https://github.com/zDarkx1/Pactra/blob/72ab637c2b3a818678a042e50defbe6bbe97433a/docs/" +
                          file
                        }
                        className="break-words text-ink underline decoration-[var(--hairline)] underline-offset-4 hover:decoration-ink"
                      >
                        [{i + 1}] {label}
                        <span className="mt-1 block font-mono text-xs text-muted">
                          {file}
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        </article>
      </main>
      <footer className="border-t border-[var(--hairline)] px-6 py-10">
        <div className="mx-auto flex max-w-[1040px] flex-wrap justify-between gap-4 text-sm">
          <Link
            href="/#journal"
            className="inline-flex min-h-11 items-center gap-2 text-ink"
          >
            <ArrowLeft size={16} />
            Back to Pactra
          </Link>
          <span className="self-center text-muted">
            Clear scope. Shared evidence. Human decisions.
          </span>
        </div>
      </footer>
    </div>
  );
}
