type ScrollInput = {
  type: string;
  detail?: number;
  button?: number;
  isPrimary?: boolean;
};

export function getScrollBehavior(event: ScrollInput): 'auto' | 'smooth' {
  if (event.type === 'pointerdown' && event.button === 0 && event.isPrimary === true) return 'smooth';
  if (event.type === 'click' && (event.detail ?? 0) > 0 && event.button === 0) return 'smooth';
  return 'auto';
}

export function installScrollBehavior(target: Window): () => void {
  const root = target.document.documentElement;
  const previous = root.getAttribute('data-scroll-behavior');
  const events = ['pointerdown', 'pointercancel', 'click', 'keydown', 'focus', 'blur', 'invalid', 'submit', 'popstate', 'pagehide', 'pageshow'] as const;
  const update = (event: Event) => {
    const next = getScrollBehavior(event);
    if (root.getAttribute('data-scroll-behavior') !== next) root.setAttribute('data-scroll-behavior', next);
  };

  root.setAttribute('data-scroll-behavior', 'auto');
  for (const event of events) target.addEventListener(event, update, { capture: true, passive: true });

  return () => {
    for (const event of events) target.removeEventListener(event, update, true);
    if (previous === null) root.removeAttribute('data-scroll-behavior');
    else root.setAttribute('data-scroll-behavior', previous);
  };
}
