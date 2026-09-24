// User-supplied GhostFibers, integrated with lifecycle/fallback safeguards
export const finite = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
export const normalizeDpr = (value?: number) => Math.min(1.5, Math.max(0.5, finite(value, 1)));
export const normalizeFps = (value?: number) => Math.min(120, Math.max(1, finite(value, 30)));
export const normalizeLayers = (value?: number) => Math.min(10, Math.max(1, Math.round(finite(value, 4))));
export function mayAnimate(gates: {
  visible: boolean; hidden: boolean; reduced: boolean; paused: boolean; disposed: boolean; failed: boolean;
}) {
  return gates.visible && !gates.hidden && !gates.reduced && !gates.paused && !gates.disposed && !gates.failed;
}
export function frameDue(now: number, previous: number, fps: number) {
  return Number.isFinite(now) && Number.isFinite(previous) && now - previous >= 1000 / normalizeFps(fps);
}
export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, '');
  const normalized = value.length === 3 ? value.replace(/./g, channel => channel + channel) : value;
  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized);
  if (!match) return [1, 1, 1];
  return [parseInt(match[1], 16) / 255, parseInt(match[2], 16) / 255, parseInt(match[3], 16) / 255];
}
