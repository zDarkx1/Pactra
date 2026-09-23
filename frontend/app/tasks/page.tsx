import AppShell from '../../components/app-shell';
import TaskListView from '../../components/tasks/task-list';

export default function TasksPage() {
  return <AppShell title="Agreements" description="Review invitations, agree on terms, and keep track of what comes next."><TaskListView /></AppShell>;
}
