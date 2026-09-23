import type { Metadata } from 'next';
import AppShell from '../../../components/app-shell';
import TaskDetailView from '../../../components/tasks/task-detail';

export const metadata: Metadata = { title: 'Task agreement | Pactra', robots: { index: false, follow: false } };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell title="Task agreement" description="Read the exact terms and current state."><TaskDetailView id={id} /></AppShell>;
}
