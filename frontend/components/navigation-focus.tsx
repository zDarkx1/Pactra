'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createNavigationFocus } from '../lib/navigation-focus';

export function NavigationFocus() {
  const pathname = usePathname();
  const [intent] = useState(createNavigationFocus);
  useEffect(() => {
    function request(event: Event) {
      if (event instanceof CustomEvent && typeof event.detail === 'string') intent.request(event.detail);
    }
    window.addEventListener('pactra:focus-main', request);
    window.addEventListener('pointerdown', intent.clear, true);
    window.addEventListener('keydown', intent.clear, true);
    window.addEventListener('popstate', intent.clear);
    window.addEventListener('pagehide', intent.clear);
    return () => {
      intent.clear();
      window.removeEventListener('pactra:focus-main', request);
      window.removeEventListener('pointerdown', intent.clear, true);
      window.removeEventListener('keydown', intent.clear, true);
      window.removeEventListener('popstate', intent.clear);
      window.removeEventListener('pagehide', intent.clear);
    };
  }, [intent]);
  useLayoutEffect(() => {
    if (intent.consume(pathname)) document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname, intent]);
  return null;
}
