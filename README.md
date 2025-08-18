# @devmattic/orbly
A Tailwind‑friendly, ESM‑only custom cursor blob with magnetic hover. Ships no CSS; uses inline styles and works great alongside Tailwind v4. SSR‑safe.

## Demo
Open demo/index.html in your browser (after building to dist) to try size, color, opacity, blobiness, and speed. The page loads Tailwind v4 via CDN and imports the local build via an import map.

## Install & use

```ts
// main.ts (TypeScript)
import { createCursor, type OrblyAPI, type OrblyOptions } from '@devmattic/orbly';

const options: OrblyOptions = {
  // interactive: 'a, button, [role="button"], input, textarea, select, summary, .is-interactive, [data-cursor], [data-cursor="hover"]',
  // startX: window.innerWidth / 2,
  // startY: window.innerHeight / 2,
  // speed: { blob: 0.22 },
  // size: 20,
  // color: '#ffffff',
  // opacity: 1,
  // blobiness: 0.35,
};

const cursor: OrblyAPI = createCursor(options);

// Runtime controls
cursor.setScale(1.0);              // overall scale multiplier
cursor.setSpeed({ blob: 0.25 });   // follow responsiveness (0..1)
cursor.setSize(24);                // px
cursor.setColor('#ff00aa');        // any CSS color
cursor.setOpacity(0.8);            // 0..1
cursor.setBlobiness(0.4);          // max distortion (0..1)

// Change which elements count as interactive (hover growth + optional magnet)
cursor.setInteractive('a, button, [data-cursor], [data-cursor="hover"]');
```

### Framework usage (Next.js client component)
```tsx
'use client';
import { useEffect } from 'react';
import { createCursor, type OrblyAPI } from '@devmattic/orbly';

export default function CursorClient() {
  useEffect(() => {
    const api: OrblyAPI = createCursor();
    return () => api.destroy();
  }, []);
  return null;
}
```

## Behavior
- Regular OS pointer remains visible; the blob overlays and follows.
- High contrast via mix-blend-mode: difference; you can override color via setColor.
- Hover/active states: blob grows slightly on hover and on mousedown.
- Respects prefers-reduced-motion.
- Optional magnet behavior for anchors and elements with data-cursor-magnet.

## API

Types:
```ts
import type { OrblyAPI, OrblyOptions } from '@devmattic/orbly';
```

OrblyOptions
- interactive?: string
- startX?: number
- startY?: number
- speed?: { blob?: number }
- size?: number            // px
- color?: string           // CSS color
- opacity?: number         // 0..1
- blobiness?: number       // 0..1 max distortion
- respectReducedMotion?: boolean
- container?: HTMLElement

OrblyAPI methods
- destroy(): void
- setScale(scale: number): void
- setColor(color: string): void
- setSpeed(next: { blob?: number }): void
- setInteractive(selector: string): void
- setSize(px: number): void
- setOpacity(alpha: number): void
- setBlobiness(amount: number): void
- hoverIn(el?: HTMLElement | null): void
- hoverOut(): void
- addMagnet(el: HTMLElement): void
- removeMagnet(el: HTMLElement): void
- getElements(): { root: HTMLElement; blob: HTMLElement }

## Notes
- Tailwind v4 compatible (demo uses CDN runtime build). No Tailwind config required.
- ESM‑only; SSR‑safe no‑op on server and disabled on coarse pointers.
- No runtime dependencies.

## License
MIT © Devmattic
