export type CursorOptions = {
  interactive?: string;
  startX?: number;
  startY?: number;
  speed?: { dot?: number; ring?: number; trail?: number };
  respectReducedMotion?: boolean;
  container?: HTMLElement;
};

export type CursorAPI = {
  destroy(): void;
  setScale(scale: number): void;
  setColor(rgb: string): void;
  getElements(): { root: HTMLElement; dot: HTMLElement; ring: HTMLElement; trail: HTMLElement };
};

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
const lerp = (a: number, b: number, n: number) => (1 - n) * a + n * b;

export function createCursor(opts: CursorOptions = {}): CursorAPI {
  if (!hasWindow) {
    return { destroy() {}, setScale() {}, setColor() {}, getElements() { throw new Error('SSR context'); } } as CursorAPI;
  }
  const isFinePointer = matchMedia('(pointer: fine)').matches;
  if (!isFinePointer) {
    return { destroy() {}, setScale() {}, setColor() {}, getElements() { throw new Error('Disabled on coarse pointers'); } } as CursorAPI;
  }

  const {
    interactive = 'a, button, [role="button"], input, textarea, select, summary, .is-interactive',
    startX = window.innerWidth / 2,
    startY = window.innerHeight / 2,
    speed = { dot: 0.25, ring: 0.12, trail: 0.08 },
    respectReducedMotion = true,
    container = document.body
  } = opts;

  const reduceMotion = respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const root = document.createElement('div');
  root.className = 'cc cc--hidden';
  const trail = document.createElement('div'); trail.className = 'cc__trail';
  const ring  = document.createElement('div'); ring.className  = 'cc__ring';
  const dot   = document.createElement('div'); dot.className   = 'cc__dot';
  root.append(trail, ring, dot);
  container.append(root);

  let mouse = { x: startX, y: startY };
  let dotPos = { x: startX, y: startY };
  let ringPos = { x: startX, y: startY };
  let trailPos = { x: startX, y: startY };
  const magnets = new Set<HTMLElement>();

  const onMouseMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; root.classList.remove('cc--hidden'); };
  const onLeave = () => root.classList.add('cc--hidden');
  const onEnter = () => root.classList.remove('cc--hidden');
  const onDown = () => root.classList.add('cc--down');
  const onUp   = () => root.classList.remove('cc--down');
  const onOver = (e: MouseEvent) => {
    const el = (e.target as Element | null)?.closest?.(interactive) as HTMLElement | null;
    root.classList.toggle('cc--hover', !!el);
    if (el && el.tagName.toLowerCase() === 'a') magnets.add(el);
  };
  const onOut = (e: MouseEvent) => {
    const related = (e.relatedTarget as Element | null)?.closest?.(interactive);
    if (!related) root.classList.remove('cc--hover');
    const a = e.target as HTMLElement; if (a && magnets.has(a)) magnets.delete(a);
  };

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseleave', onLeave);
  window.addEventListener('mouseenter', onEnter);
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  document.addEventListener('mouseover', onOver as any);
  document.addEventListener('mouseout', onOut as any);

  let raf = 0;
  const tick = () => {
    let target = { ...mouse };
    for (const el of magnets) { const r = el.getBoundingClientRect(); target.x = r.left + r.width / 2; target.y = r.top + r.height / 2; break; }
    dotPos.x = lerp(dotPos.x, mouse.x, speed.dot ?? 0.25);
    dotPos.y = lerp(dotPos.y, mouse.y, speed.dot ?? 0.25);
    ringPos.x = lerp(ringPos.x, target.x, speed.ring ?? 0.12);
    ringPos.y = lerp(ringPos.y, target.y, speed.ring ?? 0.12);
    trailPos.x = lerp(trailPos.x, mouse.x, speed.trail ?? 0.08);
    trailPos.y = lerp(trailPos.y, mouse.y, speed.trail ?? 0.08);
    (dot  as HTMLElement).style.transform   = `translate(${dotPos.x}px, ${dotPos.y}px) translate(-50%, -50%) var(--cursor-dot-extra, '')`;
    (ring as HTMLElement).style.transform  = `translate(${ringPos.x}px, ${ringPos.y}px) translate(-50%, -50%) var(--cursor-ring-extra, '')`;
    (trail as HTMLElement).style.transform = `translate(${trailPos.x}px, ${trailPos.y}px) translate(-50%, -50%)`;
    raf = requestAnimationFrame(tick);
  };

  if (!reduceMotion) raf = requestAnimationFrame(tick);

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseleave', onLeave);
    window.removeEventListener('mouseenter', onEnter);
    window.removeEventListener('mousedown', onDown);
    window.removeEventListener('mouseup', onUp);
    document.removeEventListener('mouseover', onOver as any);
    document.removeEventListener('mouseout', onOut as any);
    root.remove();
  }

  function setScale(scale: number) { (root as HTMLElement).style.setProperty('--cursor-scale', String(scale)); }
  function setColor(rgb: string) { (root as HTMLElement).style.setProperty('--cursor-color', rgb); }

  return { destroy, setScale, setColor, getElements: () => ({ root, dot, ring, trail }) };
}