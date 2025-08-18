export type OrblyOptions = {
  interactive?: string;
  startX?: number;
  startY?: number;
  // smoothing for blob follow (0..1). Higher is snappier.
  speed?: { blob?: number };
  // initial size in pixels of the blob (width/height)
  size?: number;
  // any valid CSS color (used as currentColor for mix-blend-mode: difference)
  color?: string;
  // 0..1 element opacity
  opacity?: number;
  // maximum distortion from velocity (0..1), default 0.35
  blobiness?: number;
  respectReducedMotion?: boolean;
  container?: HTMLElement;
};


export type OrblyAPI = {
  destroy(): void;
  setScale(scale: number): void;
  setColor(color: string): void;
  setSpeed(next: { blob?: number }): void;
  setInteractive(selector: string): void;
  setSize(px: number): void;
  setOpacity(alpha: number): void;
  setBlobiness(amount: number): void;
  hoverIn(el?: HTMLElement | null): void;
  hoverOut(): void;
  addMagnet(el: HTMLElement): void;
  removeMagnet(el: HTMLElement): void;
  getElements(): { root: HTMLElement; blob: HTMLElement };
};


const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
const lerp = (a: number, b: number, n: number) => (1 - n) * a + n * b;

export function createCursor(opts: OrblyOptions = {}): OrblyAPI {
  if (!hasWindow) {
    return {
      destroy() {}, setScale() {}, setColor() {}, setSpeed() {}, setInteractive() {}, setSize() {}, setOpacity() {}, setBlobiness() {}, hoverIn() {}, hoverOut() {}, addMagnet() {}, removeMagnet() {},
      getElements() { throw new Error('SSR context'); }
    } as OrblyAPI;
  }
  const isFinePointer = matchMedia('(pointer: fine)').matches;
  if (!isFinePointer) {
    return {
      destroy() {}, setScale() {}, setColor() {}, setSpeed() {}, setInteractive() {}, setSize() {}, setOpacity() {}, setBlobiness() {}, hoverIn() {}, hoverOut() {}, addMagnet() {}, removeMagnet() {},
      getElements() { throw new Error('Disabled on coarse pointers'); }
    } as OrblyAPI;
  }

  let interactive = opts.interactive ?? 'a, button, [role="button"], input, textarea, select, summary, .is-interactive, [data-cursor], [data-cursor="hover"]';
  const {
    startX = window.innerWidth / 2,
    startY = window.innerHeight / 2,
    speed = { blob: 0.22 },
    size = 20,
    color = '#ffffff',
    opacity = 1,
    blobiness: blobinessOpt = 0.35,
    respectReducedMotion = true,
    container = document.body
  } = opts;

  const reduceMotion = respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Root container and single "blob" element
  const root = document.createElement('div');
  root.className = 'cc cc--hidden';
  const blob = document.createElement('div');
  blob.className = 'cc__blob';
  root.append(blob);
  container.append(root);

  // Inline styles to avoid external CSS requirements
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0px',
    pointerEvents: 'none',
    zIndex: '2147483647',
    contain: 'layout style paint',
  } as Partial<CSSStyleDeclaration>);
  Object.assign(blob.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '9999px',
    background: 'currentColor',
    color,
    mixBlendMode: 'difference', // ensures high contrast against background
    transform: 'translate(-50%, -50%) scale(var(--cursor-scale, 1))',
    willChange: 'transform',
    pointerEvents: 'none',
    opacity: String(Math.max(0, Math.min(1, opacity))),
  } as Partial<CSSStyleDeclaration>);

  let mouse = { x: startX, y: startY };
  let pos = { x: startX, y: startY };
  let prev = { x: startX, y: startY };
  const magnets = new Set<HTMLElement>();

  const onMouseMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; root.classList.remove('cc--hidden'); };
  const onLeave = () => root.classList.add('cc--hidden');
  const onEnter = () => root.classList.remove('cc--hidden');
  const onDown = () => root.classList.add('cc--down');
  const onUp   = () => root.classList.remove('cc--down');
  const onOver = (e: MouseEvent) => {
    const targetEl = e.target as Element | null;
    const el = targetEl?.closest?.(interactive) as HTMLElement | null;
    root.classList.toggle('cc--hover', !!el);
    if (el && (el.tagName.toLowerCase() === 'a' || el.hasAttribute('data-cursor-magnet'))) magnets.add(el);
  };
  const onOut = (e: MouseEvent) => {
    const related = (e.relatedTarget as Element | null)?.closest?.(interactive);
    if (!related) root.classList.remove('cc--hover');
    const a = (e.target as Element | null) as HTMLElement | null;
    if (a && magnets.has(a)) magnets.delete(a);
  };

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseleave', onLeave);
  window.addEventListener('mouseenter', onEnter);
  window.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  document.addEventListener('mouseover', onOver as any);
  document.addEventListener('mouseout', onOut as any);

  let raf = 0;
  let speeds = { blob: speed.blob ?? 0.22 };

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  // hover/active boost state
  let boost = 1; // current animated boost
  const boostLerp = 0.25; // smoothing for boost transitions

  // blobiness (max distortion)
  let blobiness = clamp(blobinessOpt, 0, 1);

  const computeTargetBoost = () => {
    // Base is 1, hover adds +0.15, active adds +0.1 (stackable)
    let b = 1;
    if (root.classList.contains('cc--hover')) b += 0.15;
    if (root.classList.contains('cc--down')) b += 0.1;
    return b;
  };

  const tick = () => {
    let target = { ...mouse };
    // magnet support
    for (const el of magnets) { const r = el.getBoundingClientRect(); target.x = r.left + r.width / 2; target.y = r.top + r.height / 2; break; }

    // follow with smoothing
    pos.x = lerp(pos.x, target.x, speeds.blob);
    pos.y = lerp(pos.y, target.y, speeds.blob);

    // compute velocity for squish
    const vx = pos.x - prev.x;
    const vy = pos.y - prev.y;
    const speedLen = Math.hypot(vx, vy);
    const angle = Math.atan2(vy, vx);

    // squish based on velocity (water-balloon like)
    const squish = reduceMotion ? 0 : clamp(speedLen / 25, 0, blobiness);
    const scaleX = (1 + squish);
    const scaleY = (1 - squish);

    // apply hover/active boost smoothly
    const targetBoost = computeTargetBoost();
    boost = reduceMotion ? targetBoost : lerp(boost, targetBoost, boostLerp);

    blob.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) rotate(${angle}rad) scale(${scaleX * boost}, ${scaleY * boost})`;

    prev.x = pos.x; prev.y = pos.y;
    raf = requestAnimationFrame(tick);
  };

  if (!reduceMotion) {
    raf = requestAnimationFrame(tick);
  } else {
    // Reduced motion: jump to mouse without animation
    const onMove = () => {
      blob.style.transform = `translate(${mouse.x}px, ${mouse.y}px) translate(-50%, -50%)`;
    };
    window.addEventListener('mousemove', onMove, { passive: true });
  }

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
  function setColor(nextColor: string) { (root as HTMLElement).style.setProperty('--cursor-color', nextColor); blob.style.color = nextColor; }
  function setSpeed(next: { blob?: number }) {
    speeds = { blob: next.blob ?? speeds.blob };
  }
  function setInteractive(selector: string) { interactive = selector; }
  function setSize(px: number) { const v = Math.max(1, px|0); blob.style.width = `${v}px`; blob.style.height = `${v}px`; }
  function setOpacity(alpha: number) { const a = clamp(alpha, 0, 1); blob.style.opacity = String(a); }
  function setBlobiness(amount: number) { blobiness = clamp(amount, 0, 1); }
  function hoverIn(el?: HTMLElement | null) {
    root.classList.add('cc--hover');
    if (el && !magnets.has(el) && (el.tagName?.toLowerCase?.() === 'a' || el.hasAttribute('data-cursor-magnet'))) magnets.add(el);
  }
  function hoverOut() {
    root.classList.remove('cc--hover');
    magnets.clear();
  }
  function addMagnet(el: HTMLElement) { magnets.add(el); }
  function removeMagnet(el: HTMLElement) { if (magnets.has(el)) magnets.delete(el); }

  return { destroy, setScale, setColor, setSpeed, setInteractive, setSize, setOpacity, setBlobiness, hoverIn, hoverOut, addMagnet, removeMagnet, getElements: () => ({ root, blob }) };
}
