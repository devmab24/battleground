# Battleground: "Arena of the Ancients" redesign

Reference mockups live next to this file (`*.dc.html`). They are design-canvas
files: inline styles plus a small JS class for demo state. Treat them as a
visual reference only. Do not copy their markup or JS into `public/`.
Image URLs like `/_blob/...` won't load locally; `sprites/` has the same art.

## Rules
- Keep every existing id, `data-action`, `data-side`, `hidden` toggle, `role` and
  `aria-*` in `public/index.html`. `script.js` depends on them. Logic stays as is.
- Restyle with classes in `public/style.css`. Add markup only where the design
  needs a wrapper or decoration (decoration gets `aria-hidden="true"`).
- No build step, no frameworks, no paid services. Fonts come from Google Fonts.
- Wrap every animation in `@media (prefers-reduced-motion: reduce) { animation: none }`.
- Must work at 360px wide: fighter panels stack and the VS badge sits between them.

## Tokens
```css
:root {
  --ink: #1A0F0A;        /* outlines, shadows */
  --earth: #1C110B;      /* page background */
  --earth-2: #25170E;    /* zigzag pattern */
  --panel: #2B1A10;      /* raised panels */
  --bone: #F3E3C3;       /* light surfaces, main text on dark */
  --bone-2: #E8D6B0;     /* secondary text on dark */
  --input: #FFF6E2;
  --gold: #F2B233;       /* winner, primary buttons */
  --gold-light: #FFE08A;
  --terracotta: #D2552A;
  --green: #1E8A4F;
  --fighter-a: #6F8BFF;  /* adire indigo, ink text on it */
  --fighter-b: #E8673A;  /* laterite red, ink text on it */
  --danger: #B0361A;
  --outline: 4px solid var(--ink);
  --shadow: 6px 6px 0 var(--ink);
}
```
Fonts: `Bungee` (display, buttons, names), `Silkscreen` (small pixel labels),
`Archivo` 400/600/800 (body).
`<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Bungee&family=Silkscreen:wght@400;700&display=swap" rel="stylesheet">`

## Shared pieces
- Page background: mud-cloth zigzag made from four 25% linear-gradients
  (see `.bg-zig` in any mockup).
- Kente band: 18px stripe at the top and bottom of the page and the top of
  panels (`.kente`).
- Title text: gold fill, 3–4px ink `-webkit-text-stroke` with `paint-order: stroke fill`,
  stacked hard shadows `4px 4px 0 terracotta, 8px 8px 0 ink` (`.title-arcade`).
- Buttons: ink outline plus hard shadow. Hover lifts 2px, active presses 4px (`.btn-press`).
- Header: round emblem SVG, "BATTLEGROUND" wordmark, "ARENA OF THE ANCIENTS"
  subtitle, BattleDex button with its count badge.

## Screens
1. **Form** (`Main.dc.html`): eyebrow "◆ ENTER THE ARENA ◆", h1 "WHO WALKS OUT OF THE
   ARENA?". Each fighter is a bone card with a coloured header strip ("FIGHTER A ·
   WEST GATE", "FIGHTER B · EAST GATE"), a 64px Bungee input and the char counter.
   VS badge in the middle with a spinning conic sunburst. Big gold FIGHT! button.
   Over 50 chars: input border and counter turn terracotta/danger, and the existing
   `#form-message` shows as a dark alert box.
2. **Loading** (`Loading.dc.html`): two portrait frames with a "?" and shimmer
   (Fighter A/B names from the form), a centre spinner (3 counter-rotating rings),
   "THE GRIOTS DELIBERATE", the existing rotating `#loading-text`, five drum bars.
3. **Result** (`Result.dc.html`): eyebrow "◆ THE GRIOT HAS SPOKEN ◆", h1
   "{WINNER} WINS!" with a slam-in animation. `.card.is-winner`: wider, 6px gold
   border, pulsing gold glow, rotating sunburst behind, "CHAMPION" crown banner,
   gold dotted art panel. Other card: smaller, `grayscale(.85) brightness(.72)`,
   "DEFEATED" stamp over the art. Art uses `image-rendering: pixelated`.
   `#reasoning` sits on a parchment scroll, heading "THE GRIOT'S TALE".
4. **BattleDex** (`Dex.dc.html`): eyebrow "◆ HALL OF CHAMPIONS ◆", h1 "BATTLEDEX".
   Grid `repeat(auto-fill, minmax(220px, 1fr))` of plaque cards: "No. 001" tag, art,
   bone name plate, 44px icon delete button (keep its aria-label). Empty state card.
   Clear all as a terracotta outline button.
5. **Error** view (not mocked): same panel style, Bungee title, gold "Try again".
