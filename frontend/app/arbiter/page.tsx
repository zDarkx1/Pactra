import type { Metadata } from 'next';
import AppShell from '../../components/app-shell';
import ArbiterDashboard from '../../components/arbiter-dashboard';
export const metadata: Metadata = { title: 'Arbiter workspace', robots: { index: false, follow: false } };
export default function ArbiterPage() {
  return <AppShell title="Arbiter workspace" description="Read the evidence. Verify your authority. Confirm every allocation."><ArbiterDashboard /></AppShell>;
}
