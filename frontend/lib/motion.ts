export type MotionHandle = { cancel: () => void; finish: () => void };

export function canAnimate(pointer: boolean, reduced: boolean, hidden: boolean): boolean {
  return pointer && !reduced && !hidden;
}

export function runMotion(element: Pick<HTMLElement, 'animate'>, frames: Keyframe[], options: KeyframeAnimationOptions & { duration: number }, onComplete: () => void = () => {}): MotionHandle {
  let animation: Animation | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  function clear() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (animation) {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
      animation = null;
    }
  }
  function finish() {
    if (settled) return;
    settled = true;
    clear();
    onComplete();
  }
  function cancel() {
    if (settled) return;
    settled = true;
    clear();
  }
  if (options.duration <= 0) finish();
  else {
    try {
      animation = element.animate(frames, options);
      animation.onfinish = finish;
      animation.oncancel = finish;
      timer = setTimeout(finish, options.duration + 50);
    } catch { finish(); }
  }
  return { cancel, finish };
}
