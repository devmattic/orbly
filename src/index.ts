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
  // auto switch blob color to maintain contrast on non-isolated/light surfaces
  autoContrast?: boolean;
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
  setAutoContrast(on: boolean): void;
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
      destroy() {}, setScale() {}, setColor() {}, setSpeed() {}, setInteractive() {}, setSize() {}, setOpacity() {}, setBlobiness() {}, setAutoContrast() {}, hoverIn() {}, hoverOut() {}, addMagnet() {}, removeMagnet() {},
      getElements() { throw new Error('SSR context'); }
    } as OrblyAPI;
  }
  const isFinePointer = matchMedia('(pointer: fine)').matches;
  if (!isFinePointer) {
    return {
      destroy() {}, setScale() {}, setColor() {}, setSpeed() {}, setInteractive() {}, setSize() {}, setOpacity() {}, setBlobiness() {}, setAutoContrast() {}, hoverIn() {}, hoverOut() {}, addMagnet() {}, removeMagnet() {},
      getElements() { throw new Error('Disabled on coarse pointers'); }
    } as OrblyAPI;
  }

  let interactive = opts.interactive ?? 'a, button, [role="button"], input, textarea, select, summary, .is-interactive, [data-cursor], [data-cursor="hover"]';
  const {
    startX = window.innerWidth / 2,
    startY = window.innerHeight / 2,
    speed = { blob: 0.22 },
    size = 100,
    color = '#ffffff',
    opacity = .75,
    blobiness: blobinessOpt = 0.25,
    autoContrast = true,
    respectReducedMotion = true,
    container = document.body
  } = opts;

  const reduceMotion = respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Root container and single "blob" element
  const root = document.createElement('div');
  root.className = 'cc cc--hidden';
  // Default to 5x larger blob initially
  (root as HTMLElement).style.setProperty('--cursor-scale', '5');
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
    mixBlendMode: 'difference', // default: ensures high contrast against background with white/black
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

  // Utility: parse rgb/rgba() to {r,g,b,a}
  function parseRGBA(input: string): { r: number; g: number; b: number; a: number } | null {
    const m = input.trim().match(/^rgba?\(([^)]+)\)$/i);
    if (!m) return null;
    const parts = m[1].split(',').map(s => s.trim());
    if (parts.length < 3) return null;
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
    return { r, g, b, a: isNaN(a) ? 1 : a };
  }
  // Resolve any valid CSS color to RGBA using computed styles
  function resolveColorToRGBA(input: string): { r: number; g: number; b: number; a: number } | null {
    const tmp = document.createElement('div');
    tmp.style.color = input;
    document.body.appendChild(tmp);
    const computed = getComputedStyle(tmp).color;
    tmp.remove();
    return parseRGBA(computed || '');
  }
  function relLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
    const srgb = [r, g, b].map(v => v / 255).map(u => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)));
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }
  function contrastRatio(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
    const L1 = relLuminance(c1);
    const L2 = relLuminance(c2);
    const [bright, dark] = L1 >= L2 ? [L1, L2] : [L2, L1];
    return (bright + 0.05) / (dark + 0.05);
  }
  // Sample the first opaque background color under a point
  function getBackgroundRGBAAt(x: number, y: number): { r: number; g: number; b: number; a: number } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    let cur: HTMLElement | null = el;
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      const rgba = parseRGBA(bg || '');
      if (rgba && rgba.a > 0) return rgba;
      cur = cur.parentElement;
    }
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    return parseRGBA(bodyBg || '');
  }
  function pickContrastBW({ r, g, b, a }: { r: number; g: number; b: number; a: number }): string {
    const L = relLuminance({ r, g, b });
    return L > 0.5 ? '#000000' : '#ffffff';
  }
  function rgbaToString({ r, g, b, a }: { r: number; g: number; b: number; a: number }): string {
    const rr = Math.round(r), gg = Math.round(g), bb = Math.round(b);
    const aa = Math.max(0, Math.min(1, a));
    return aa === 1 ? `rgb(${rr}, ${gg}, ${bb})` : `rgba(${rr}, ${gg}, ${bb}, ${aa})`;
  }

  // hover/active boost state
  let boost = 1; // current animated boost
  const boostLerp = 0.25; // smoothing for boost transitions

  // blobiness (max distortion)
  let blobiness = clamp(blobinessOpt, 0, 1);

  // Lava-lamp wobble state
  let wob = { x: 1, y: 1 };
  const wobLerp = 0.12; // smoothing for wobble transitions

  const computeTargetBoost = () => {
    // Base is 1, hover adds +0.15, active adds +0.1 (stackable)
    let b = 1;
    if (root.classList.contains('cc--hover')) b += 0.15;
    if (root.classList.contains('cc--down')) b += 0.1;
    return b;
  };
  let lastContrastAt = 0;
  let autoContrastOn = !!autoContrast;
  let lastAutoColor: string | null = null;
  // Track the base (requested) color and whether we should use computed-difference mode
  let baseColorStr: string = color;
  let baseColorRGBA = resolveColorToRGBA(baseColorStr) || { r: 255, g: 255, b: 255, a: 1 };
  const isWhiteLike = (c: { r: number; g: number; b: number }) => c.r > 250 && c.g > 250 && c.b > 250;

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
    let angle = Math.atan2(vy, vx);

    // squish based on velocity (water-balloon like)
    const squish = reduceMotion ? 0 : clamp(speedLen / 25, 0, blobiness);
    let scaleX = (1 + squish);
    let scaleY = (1 - squish);

    // Lava-lamp wobble: organic time-based morphing
    if (!reduceMotion) {
      const t = performance.now() / 1000; // seconds
      // amplitude scaled by blobiness
      const amp = blobiness * 0.5; // cap wobble
      // two incommensurate frequencies for wobble
      const f1 = 0.9, f2 = 1.37;
      const f3 = 0.63, f4 = 1.21;
      const targetWobX = 1 + amp * (0.18 * Math.sin(t * 2 * Math.PI * f1) + 0.12 * Math.sin(t * 2 * Math.PI * f2 + 1.2));
      const targetWobY = 1 + amp * (0.16 * Math.sin(t * 2 * Math.PI * f3 + 0.7) + 0.10 * Math.sin(t * 2 * Math.PI * f4 + 2.1));
      wob.x = lerp(wob.x, targetWobX, wobLerp);
      wob.y = lerp(wob.y, targetWobY, wobLerp);
      scaleX *= wob.x;
      scaleY *= wob.y;
      // slight angle wobble for more organic feel
      angle += amp * 0.25 * Math.sin(t * 2 * Math.PI * 0.33);
    }

    // apply hover/active boost smoothly
    const targetBoost = computeTargetBoost();
    boost = reduceMotion ? targetBoost : lerp(boost, targetBoost, boostLerp);

    // auto-contrast: occasionally adjust color to maintain visibility
    const now = performance.now();
    if (autoContrastOn && now - lastContrastAt > 80) {
      const bg = getBackgroundRGBAAt(pos.x, pos.y);
      if (bg) {
        if (isWhiteLike(baseColorRGBA)) {
          // Default behavior for white-like base: use difference with B/W for maximum contrast
          if (blob.style.mixBlendMode !== 'difference') blob.style.mixBlendMode = 'difference';
          const bw = pickContrastBW(bg);
          if (bw !== lastAutoColor) {
            blob.style.color = bw;
            (root as HTMLElement).style.setProperty('--cursor-color', bw);
            lastAutoColor = bw;
          }
        } else {
          // For custom colors: keep the exact color if it already contrasts enough; otherwise compute per-channel difference
          const cr = contrastRatio(baseColorRGBA, bg);
          const MIN_CR = 2.6; // heuristic threshold for small, semi-opaque blob
          if (cr >= MIN_CR) {
            // Use the exact chosen color, normal blend
            if (blob.style.mixBlendMode !== 'normal') blob.style.mixBlendMode = 'normal';
            if (baseColorStr !== lastAutoColor) {
              blob.style.color = baseColorStr;
              (root as HTMLElement).style.setProperty('--cursor-color', baseColorStr);
              lastAutoColor = baseColorStr;
            }
          } else {
            // Compute per-channel difference to pop on light/low-contrast surfaces
            const diff = {
              r: Math.abs(bg.r - baseColorRGBA.r),
              g: Math.abs(bg.g - baseColorRGBA.g),
              b: Math.abs(bg.b - baseColorRGBA.b),
              a: 1,
            };
            const out = rgbaToString(diff);
            if (blob.style.mixBlendMode !== 'normal') blob.style.mixBlendMode = 'normal';
            if (out !== lastAutoColor) {
              blob.style.color = out;
              (root as HTMLElement).style.setProperty('--cursor-color', out);
              lastAutoColor = out;
            }
          }
        }
      }
      lastContrastAt = now;
    }

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
  function setColor(nextColor: string) {
    baseColorStr = nextColor;
    baseColorRGBA = resolveColorToRGBA(baseColorStr) || baseColorRGBA;
    (root as HTMLElement).style.setProperty('--cursor-color', nextColor);
    blob.style.color = nextColor;
    // Reset cache so auto-contrast updates on next frame
    lastAutoColor = null;
  }
  function setSpeed(next: { blob?: number }) {
    speeds = { blob: next.blob ?? speeds.blob };
  }
  function setInteractive(selector: string) { interactive = selector; }
  function setSize(px: number) { const v = Math.max(1, px|0); blob.style.width = `${v}px`; blob.style.height = `${v}px`; }
  function setOpacity(alpha: number) { const a = clamp(alpha, 0, 1); blob.style.opacity = String(a); }
  function setBlobiness(amount: number) { blobiness = clamp(amount, 0, 1); }
  function setAutoContrast(on: boolean) { autoContrastOn = !!on; }
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

  return { destroy, setScale, setColor, setSpeed, setInteractive, setSize, setOpacity, setBlobiness, setAutoContrast, hoverIn, hoverOut, addMagnet, removeMagnet, getElements: () => ({ root, blob }) };
}
