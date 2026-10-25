# DESIGN.md: OrbitShift (source of truth, read before every UI task)

## Direction
Mission-control instrument panel. Quiet, dense, precise. The 3D scene is the
hero; the UI is thin instrumentation around it. Flat surfaces, hairline
borders, one accent color.

## Stack (do not deviate)
- Vite + React + TypeScript (strict), pnpm only.
- 3D: three, @react-three/fiber, @react-three/drei.
- State: zustand. Sim clock lives in refs and useFrame; HUD readouts update
  at most 10 times per second.
- UI primitives: Radix (@radix-ui/react-select, -tabs, -collapsible,
  -dialog). Unstyled, styled only via CSS Modules.
- Styling: CSS Modules plus src/styles/tokens.css (fonts, colors, spacing,
  z-index). Components may use only tokens. No inline style colors, no
  Tailwind, no CSS-in-JS, no UI kit with its own theme.
- Structure: src/components/hud/*, src/components/scene/*,
  src/store/sim.ts, src/data/bodies.ts (all real planet data lives here).

## Typography (STRICT: exactly 2 font families, nothing else)
- --font-sans: "IBM Plex Sans"  -> titles, labels, buttons, body
- --font-mono: "IBM Plex Mono"  -> every number, unit, date, value, readout
- Self-host with pnpm: @fontsource/ibm-plex-sans (400, 500, 600) and
  @fontsource/ibm-plex-mono (400, 500). No Google Fonts links, no CDN.
- Define the two variables ONCE on :root. Set html { font-family: var(--font-sans) }.
- Required global reset (this is why fonts drift):
    button, input, select, textarea, optgroup { font: inherit; color: inherit; }
    * { font-family: inherit; }   then .mono { font-family: var(--font-mono) }
- Text drawn inside the 3D scene (planet labels, sprites, canvas textures,
  CSS2DRenderer) uses the same two fonts. Await document.fonts.load() for
  each weight before first render.
- RULE: the string "font-family" may appear only in the :root token block and
  the global reset. Any other occurrence is a bug.
- Sizes (only these): 11px label (uppercase, 0.08em tracking), 13px body,
  16px panel title, 20px key readout. No other sizes, no bold headlines.

## Palette (CSS variables only, no hardcoded hex in components)
--bg #0A0B0D  --panel #0F1114  --line #23272E
--text #D7DAE0  --muted #7A818C
--accent #FFB000 (single accent: selection and key values)
--alert #FF5A4D (warnings only, rare)
No gradients on UI. No second accent. Status colors: plain text or a 6px dot.

## Content rules (no AI-looking filler)
- NO badges, chips, tags or pills for status. Banned examples: "CERES TUG",
  "MISSION TARGET", "TARGET LOCKED", "Safe", "10/10". Show status as a plain
  muted label with an optional 6px dot, only where the user needs it.
- NO paragraphs or descriptions anywhere on the UI. Max one line of text per
  item, max ~32 characters per label. Titles are 1 to 3 words.
- Information is shown as label/value rows (label muted, value mono, right-aligned).
- No subtitles under the app name. No marketing copy, no "Humanity's home
  world" style blurbs, no onboarding text.
- Keep real data and units (AU, km, kg, years). Never invent stats.
- Buttons are text or a single line icon, never both icon and badge.

## Layout (CSS Grid app shell, responsive, no overlap)
The canvas is a grid cell, NOT a full-screen layer under floating panels.
Desktop (>= 1024px): columns 240px 1fr 300px; rows auto 1fr auto
  areas: "top top top" / "bodies canvas info" / "time time time"
  - top: app name left, Target select and Options right. Max 4 controls.
  - left: body list plus collapsed "Scale" section (label/value rows).
  - right: info panel (name, type, label/value rows). No prev/next, no dots.
  - bottom: one compact time bar (play, speed presets, date readout, scrubber).
Tablet (640-1023px): body list becomes a horizontal scroll strip above the
  canvas; info panel becomes a collapsible drawer below it.
Mobile (< 640px): canvas 55-60dvh on top; tab bar (Bodies | Info | Time)
  below, one panel visible at a time; tap targets >= 44px.
Telemetry items (Plume Canting, Verification, Scale Matrix) live as rows
inside the Info or Scale panels, never as top-bar pills.

## Anti-overlap and anti-clunk rules
- position: absolute/fixed only for tooltip and drawer. Never for layout.
- Every panel: min-width: 0; overflow: auto. Long values scroll or truncate
  with ellipsis inside the panel, never clip or push layout.
- Panels never overlap each other or the time bar. No UI over the canvas
  except small planet labels, hidden when two would collide.
- dvh not vh, env(safe-area-inset-*), clamp() for fluid spacing, no fixed
  pixel container widths. Numbers: tabular-nums, fixed-width containers.
- z-index only via variables: canvas 0, panels 10, drawer 20, tooltip 30.
- Panels: 1px --line border, radius <= 4px, no shadow, no blur or glass,
  no card-inside-card. Open/close 150ms, transform and opacity only.
- Resize handling: camera aspect, renderer size, pixel ratio capped at 2,
  via ResizeObserver. Respect prefers-reduced-motion.
- Touch: one-finger orbit, pinch zoom, tap to select.

## Banned
Glassmorphism, backdrop-blur, gradients on UI, glows on UI, emoji,
decorative icons, pill buttons, pagination dots, identical card grids,
fake stats, lorem ipsum, descriptive paragraphs, more than 2 font families.

## Definition of done (check every time)
1. Grep: "font-family" appears only in the token block and global reset.
2. Grep: no hardcoded hex colors outside the variables file.
3. No element has text longer than one line at 1280px (except the date readout).
4. Screenshots at 360x740, 768x1024, 1280x800, 1920x1080 (portrait + landscape):
   no horizontal scroll, no overlaps, no clipped text. List and fix failures.

## Code comments
- Default is no comment. The code and names should explain themselves.
- Comment only when the reason is not obvious (a workaround, a unit, a
  performance trap). One line, plain language, saying what it does or why.
- Max 80 characters per comment. No multi-line comments, no banner blocks,
  no ===== or ----- dividers, no ASCII art.
- Never reference DESIGN.md, "single source of truth", "tokens", or the
  design process inside code comments.
- No file header comments. No section headers in CSS or TS unless the file
  is over 150 lines, and then a plain one-line label like: /* Panels */
- No comments that restate the code (e.g. "set the color", "loop over planets").
- Allowed: units and meaning where unclear, e.g. /* AU */ or /* km/s */,
  and TODO: with a specific action.

## Dependencies
- Never edit package.json by hand to add or change dependencies.
- Always use pnpm add <pkg> or pnpm add -D <pkg>. Run it, don't just write it.
- Scaffold only with: pnpm create vite@latest <name> --template react-ts
- Do not use create-react-app, npm, or yarn. Do not commit node_modules.
- If a package is missing, install it with pnpm, then continue. Do not
  replace it with hand-written code or a CDN link.
- Before finishing, run pnpm install, pnpm exec tsc --noEmit, and pnpm build.
  All must pass.
