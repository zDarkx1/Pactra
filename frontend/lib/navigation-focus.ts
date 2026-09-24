export function createNavigationFocus() {
  let destination: string | null = null;
  return {
    request(path: string) { destination = path; },
    clear() { destination = null; },
    consume(path: string) {
      const matches = destination === path;
      destination = null;
      return matches;
    },
  };
}
