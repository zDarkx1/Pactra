// Only return to workspace routes, never an external URL or the connect page itself.
export function workspaceDestination(value?: string): string {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/tasks';
  try {
    const url = new URL(value, 'https://pactra.invalid');
    if (url.origin !== 'https://pactra.invalid') return '/tasks';
    if (url.pathname === '/tasks' || url.pathname.startsWith('/tasks/') || ['/checker', '/arbiter', '/dashboard'].includes(url.pathname)) {
      return url.pathname + url.search + url.hash;
    }
  } catch { }
  return '/tasks';
}
