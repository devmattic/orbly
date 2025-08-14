# @devmattic/orbly
A Tailwind‑first, ESM‑only custom cursor (dot + ring + trail) with magnetic link hover. Ships no CSS — you style it via Tailwind v4 (@layer components). Zero runtime deps. SSR‑safe.

## README (Tailwind v4 setup)
Add these styles to your app's Tailwind pipeline (e.g. app/globals.css, app/site.cs, etc)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  :root { --cursor-size: 18px; --cursor-scale: 1; --ring-size: 42px; --ring-border: 2px; --cursor-color: 255,255,255; --trail-size: 6px; }
  @media (pointer: fine) { body { @apply cursor-none; } }
  .cc { @apply fixed left-0 top-0 z-[9999] pointer-events-none; }
  .cc__dot { @apply rounded-full will-change-transform; background: rgba(var(--cursor-color),1); mix-blend-mode:difference; transform: translate(-50%,-50%) scale(var(--cursor-scale)); transition: transform .18s cubic-bezier(.22,.61,.36,1); width: var(--cursor-size); height: var(--cursor-size); }
  .cc__ring { @apply rounded-full; width: var(--ring-size); height: var(--ring-size); box-shadow: 0 0 0 var(--ring-border) rgba(var(--cursor-color),.9) inset; mix-blend-mode:difference; transform: translate(-50%,-50%) scale(var(--cursor-scale)); transition: transform .2s cubic-bezier(.22,.61,.36,1), opacity .2s cubic-bezier(.22,.61,.36,1); opacity:.9; }
  .cc__trail { @apply rounded-full; width: var(--trail-size); height: var(--trail-size); background: rgba(var(--cursor-color),.9); transform: translate(-50%,-50%); filter: blur(.2px); opacity:.75; mix-blend-mode:difference; }
  .cc--hidden { @apply opacity-0; } .cc--hover { --cursor-scale: 1.6; } .cc--down { --cursor-scale: .8; }
  @media (prefers-reduced-motion: reduce) { .cc, .cc * { transition: none !important; animation: none !important; } }
  @media (pointer: coarse) { .cc { @apply hidden; } body { @apply cursor-auto; } }
}

```

### Install & use

```javascript
// main.ts
import { createCursor } from '@devmattic/orbly';

const cursor = createCursor();
// cursor.setColor('0,0,0');
// cursor.setScale(1.2);
```

### Next.js (client component version)
```javascript
'use client';
import { useEffect } from 'react';
import { createCursor } from '@devmattic/orbly';

export default function CursorClient() {
  useEffect(() => { const api = createCursor(); return () => api.destroy(); }, []);
  return null;
}
```

### Theming

Override CSS variables globally or per‑section:

```css
.dark-slab { --cursor-color: 0,0,0; --ring-border: 2px; }
.hero      { --cursor-size: 20px; --ring-size: 48px; }
```

## Notes

Tailwind v4 compatible (utilities via `@apply` in `@layer components`).

ESM‑only; SSR‑safe no‑op on server.

No CSS bundled; your Tailwind build owns styles.

Zero dependencies; tiny footprint.

## License

MIT © Devmattic