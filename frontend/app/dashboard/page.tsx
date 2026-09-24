import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Workspace | Pactra', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  redirect('/tasks');
}
