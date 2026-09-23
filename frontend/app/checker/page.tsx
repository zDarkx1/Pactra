import type { Metadata } from 'next';
import AppShell from '../../components/app-shell';
import CheckerWorkbench from './workbench';

export const metadata: Metadata = {
  title: 'Localization checker',
  description: 'Check localization JSON and compare exact source and submission evidence. Deterministic checks do not replace human review.',
};

export default function CheckerPage() {
  return <AppShell title="Localization checker" description="Compare source and translated JSON, then inspect the findings for each key.">
    <CheckerWorkbench />
  </AppShell>;
}
