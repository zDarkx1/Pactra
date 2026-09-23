import type { Metadata } from 'next';
import AppShell from '../../../components/app-shell';
import TaskFormView from '../../../components/tasks/task-form';

export const metadata: Metadata = { title: 'New agreement | Pactra', robots: { index: false, follow: false } };

export default function NewTaskPage() {
  return <AppShell title="New agreement" description="Set the source, deliverables, participants, and review terms."><TaskFormView /></AppShell>;
}
