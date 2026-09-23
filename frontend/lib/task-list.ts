import type { Task } from './workspace-types';

export function taskMatchesSearch(task: Task, query: string): boolean {
  const search = query.trim().toLowerCase();
  return [task.manifest.title, task.id, task.manifest.buyer, task.manifest.worker]
    .some(value => value.toLowerCase().includes(search));
}
