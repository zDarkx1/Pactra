import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicHeader } from '../components/app-shell';
import { Icon } from '../components/ui';
import LandingEvidence from '../components/landing-evidence';
import shellStyles from '../components/shell.module.css';
import styles from './landing.module.css';

export const metadata: Metadata = {
  title: 'Agreements and localization review',
  description: 'Write down the source, deliverables, and review terms. Inspect localization JSON against its source before making an acceptance decision.',
};

function AgreementSheet() {
  return <figure className={styles.agreement} aria-labelledby="agreement-title">
    <figcaption className={styles.documentBar}><span>Example agreement</span><span>Draft · not sent</span></figcaption>
    <div className={styles.documentHeading}><p>Localization</p><h2 id="agreement-title">Indonesian interface copy</h2></div>
    <dl className={styles.documentTerms}>
      <div><dt>Deliverable</dt><dd>Translate the interface strings into Indonesian.</dd></div>
      <div><dt>Source</dt><dd>A JSON snapshot, included in the agreement.</dd></div>
      <div className={styles.criteriaRow}><dt>Acceptance criteria</dt><dd><ul><li>Include every source key.</li><li>Keep placeholders such as <code>{'{name}'}</code>.</li><li>Retain the required brand terms.</li></ul></dd></div>
    </dl>
    <div className={styles.documentPolicy}><div><span>Revision limit</span><strong>2 rounds</strong></div><div><span>Review period</span><strong>48 hours</strong></div><div><span>Worker</span><strong>Invited by wallet</strong></div></div>
    <div className={styles.documentEnd}><span className={styles.documentRule} aria-hidden="true" /><p>Both people review the same terms.<br />Acceptance does not fund the task.</p></div>
    <p className={styles.exampleNote}>Illustrative terms only. No agreement has been created or signed.</p>
  </figure>;
}

const capabilities = [
  { name: 'Keys', description: 'Find missing keys and unexpected additions.' },
  { name: 'Placeholders', description: 'Compare each placeholder and how often it appears.' },
  { name: 'Required terms', description: 'Keep specified terms exactly as written, including case.' },
  { name: 'Empty values', description: 'Flag strings that are blank or contain only whitespace.' },
];

export default function HomePage() {
  return <>
    <a className={shellStyles.skipLink} href="#main-content">Skip to content</a>
    <PublicHeader />
    <main id="main-content" tabIndex={-1} className={styles.landing}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroHeading}><p className={styles.context}>For localization projects</p><h1 id="hero-title">Put the work in writing<br className={styles.desktopBreak} /> before it starts.</h1></div>
        <div className={styles.marginIntro}>
          <p>Start with a source snapshot, a named worker, and a clear set of deliverables. Both people review the same terms before accepting.</p>
          <Link className={styles.primaryLink} href="/tasks/new"><span>Create an agreement</span><Icon name="arrow-up-right" /></Link>
          <a className={styles.quietLink} href="#try-a-check">Or try a localization check <Icon name="arrow-down" /></a>
          <div className={styles.marginNote}><span className={styles.noteLine} aria-hidden="true" /><p>The agreement is private to its buyer and worker. Terms cannot be edited after creation.</p></div>
        </div>
        <div id="agreement" className={styles.documentColumn}><AgreementSheet /></div>
      </section>

      <section id="try-a-check" className={styles.evidenceSection} aria-labelledby="evidence-title">
        <div className={styles.evidenceIntro}><p className={styles.sectionLabel}>Inspect the delivery</p><h2 id="evidence-title">Try the same check<br />on both versions.</h2><p>This short example is missing a placeholder. Run it as submitted, then restore the placeholder and run it again.</p><p className={styles.finePrint}>The sample calls the real deterministic checker. It does not use AI or save a task submission.</p></div>
        <LandingEvidence />
      </section>

      <section className={styles.capabilitySection} aria-labelledby="capability-title">
        <div className={styles.capabilityIntro}><h2 id="capability-title">What the checker<br />looks for.</h2><p>Flat JSON dictionaries with string values. Translation quality still needs a person to read the work.</p><Link className={styles.quietLink} href="/checker">Check your own JSON <Icon name="arrow-up-right" /></Link></div>
        <dl className={styles.capabilityIndex}>{capabilities.map(item => <div key={item.name}><dt>{item.name}</dt><dd>{item.description}</dd></div>)}</dl>
      </section>
      <div className={styles.releaseNote}><span>Current release</span><p>Private agreements and localization checks. Funding, payouts, disputes, and stored submissions are not available.</p></div>
    </main>
    <footer className={styles.footer}><Link className={styles.footerWordmark} href="/">Pactra</Link><p>For work with a clear set of terms.</p><nav aria-label="Footer"><Link href="/tasks">Workspace</Link><Link href="/checker">Checker</Link><a href="#main-content">Back to top <Icon name="arrow-up-right" /></a></nav></footer>
  </>;
}
