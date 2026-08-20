# EWR MT HUB — build guide

An offline-first PWA for United's EWR ground-ops move team. Vanilla JS, no framework, no build
step. This file is the **design language** (how things look) and the **function language** (how
things are structured) so every screen stays uniform — no more "continuation page with no back
button, everything discombobulated."

## Files / modules

| File | What it owns |
|------|--------------|
| `index.html` | App shell, brand header, the view/tab system, the equipment DATA layer (save/load/sync, logMove, commitInv, setEqOos, pickReason/openInvPop pickers, pattern lock, sheet builders), and the settings/secure/park/aircraft/EOS features still awaiting extraction. |
| `store.js` | `window.Store` — the localStorage/remote persistence seam (`getJSON/setJSON/getRaw/setRaw/del`). |
| `staffing.js` / `staffing.css` | Manpower / staffing feature (its own module, loaded by the shell). |
| `ui.js` / `ui.css` | **The shared UI kit** — the design + function language below. Everything new builds on this. |
| `requests.js` / `requests.css` | Cross-department Send/Receive requests. The **reference implementation** of the UI kit. |
| `gse.js` / `gse.css` | The **equipment home** (home-screen GSE tile): stat cards + four tiles (Equipment List / Do Inventory / Movement Log / Out of Service) and the OOS screens. Owns the single nav stack the three sibling modules below push onto (`GSE.go`, `GSE.openSub`). Data + actions stay in `index.html` (`renderGse()` is a shim → `GSE.refresh()`). |
| `equipment.js` / `equipment.css` | Global equipment list screens: list (search/grouping), unit detail, add/edit, move, history, sheet generator. Screens only — writes go through shell globals. |
| `inventory.js` / `inventory.css` | Do Inventory screens: election (One area vs Complete), the pill-cycle count (ported tap-for-tap), proof sheet. `inv` state + `commitInv` stay in the shell; sheets get COMPLETE/PARTIAL + NOT SEEN from `invProofHTML`. |
| `movement.js` | Movement log screen + passcode wipe. Read-only over `data.movements`. |
| `sw.js` | Service worker. Bump `CACHE` (`elt-vNNN`) on every deploy and add any new file to `CORE`. |

## Design language (`ui.js` / `ui.css`)

Build markup from these component helpers instead of hand-writing HTML, so everything matches:

- `UI.tile({icon,title,sub,tone,attr})` — big action tile (`tone`: `navy` default, `teal`, `slate`).
- `UI.card(html)` — standard white card.
- `UI.field({label,id,value,placeholder,inputmode})` — labelled text input.
- `UI.chips(items, current, attr)` — a wrapped row of selectable chips. `items` = `["A"]` or
  `[{v,label}]`; `attr` is the data-attribute name used to read the pick back.
- `UI.typeahead(inputEl, listEl, {min, source, onPick})` — live suggestions under a field.
  `source(q)` returns `[{v, label, cap}]`. **Rule: any input backed by a known dataset (aircraft,
  equipment tags, people) gets a typeahead, built with this** — wrap the field in `.ui-ta-wrap`,
  add a `.ui-ta-list` div. Pure DOM updates on input; never re-renders the screen (focus survives).
  Reference: the Aircraft field in `requests.js` (fleet-scoped Mainline/Express).
- `UI.esc(s)` — HTML-escape.

Colours/spacing/radius/motion come from the tokens in `index.html` `:root` — the United palette
(`--ua-blue` #0033a0 links/chips, `--ua-action` #1414d2 CTAs, `--ua-navy` grounds, tile accents
`--ua-purple/lavender/sky/plum`), warmed neutrals (`--bg` #f7f4f0), the radius ladder (`--r-sm/md/lg/tile/pill`),
and the three-easing motion budget. Legacy names (`--navy`→United Blue, `--accent`→status amber only)
still resolve. Never hard-code a hex a token covers. Full spec: the Apple-structured, United-skinned
design system (scratchpad/Apple_United_System.md in session history; §1.5 is the token source of truth).

## Function language (`ui.js`) — how to build a screen

**Rule: every screen is a function `fn(nav)` that calls `UI.render(...)`. Never render a feature
screen by hand.** This is what guarantees a working back button on every screen.

```js
function menuScreen(nav){
  UI.render(container, nav, {
    title:"Requests", sub:"…",
    body:`…HTML (use UI.tile/card/field/chips)…`,
    mount:(root)=>{ /* wire event handlers on `root` here */ }
  });
}
function detailScreen(nav){ UI.render(container, nav, {title:"Detail", body:"…", mount:…}); }
```

- `UI.nav(container, {onExit})` → a navigation **stack** for that container.
  - `nav.go(fn)` push a screen · `nav.back()` pop (or call `onExit` at the root) · `nav.reset(fn)`
    set the root screen · `nav.refresh()` redraw current.
- `UI.render(container, nav, opts)` draws a header (title/sub + **back button auto-wired to
  `nav.back()`**) and the body, then runs `opts.mount(container)`.
- A module exposes `window.FEATURE = { open(){ nav=UI.nav(root,{onExit:goHome}); nav.reset(homeScreen); }, back:()=>nav.back() }`.
- **Attachments carry an owner.** Anything a user attaches (photos, etc.) is stamped with
  `oosWho()` (the requests "working as" identity, staffing pick as fallback). Only the owner sees
  Replace/Remove on it; every other role sees a quiet "Photo by X" caption. Reference: the OOS
  photo in `gse.js` (`oosPhotoBy`, `photoMine`).

Because the back button and header come from `UI.render`, a new "continuation" screen physically
cannot ship without one.

## Adding a feature (the uniform recipe)

1. New module `feature.js` (+ `feature.css` if needed). Wrap it in an IIFE; expose `window.FEATURE`.
2. Build every screen with `UI.nav` + `UI.render` and the `UI.*` components.
3. Add a `#view-feature` section + a home tile in `index.html`; wire `goTab("feature")` →
   `window.FEATURE.open()`. Route the app back/home to `FEATURE.back()`.
4. Persist under a namespaced key: `elt.feature.*`. For live multi-window/demo sync, write through
   `Store` and add a `window.addEventListener("storage", …)` that `nav.refresh()`es (see
   `requests.js`) — this is how the no-network demo mirror works.
5. `sw.js`: bump `CACHE`, add the new files to `CORE`.
6. Keep files focused — one concern per file. Aim small; if a module sprawls, split it.

## Migration (in progress)

Goal: shrink `index.html` by **extracting one subsystem at a time in place** (the way `staffing.js`,
`requests.js`, and `ui.js` already are) — NOT a parallel rewrite. Each extracted feature adopts the
UI kit. GSE, equipment, inventory, and movement are done — their screens live in kit modules on
one nav stack under the GSE tile; the shell keeps the data layer (the seam is documented in each
module header). `goTab("equipment"|"inventory"|"movement")` reroutes into `GSE.openSub(...)`, so
the old hub tiles keep working. Left to extract: settings (and secure/park/aircraft/EOS).
The staffing tug board bridges to the equipment records both ways (`eqTugBridge`/`tugBridgeIn`) —
the equipment record is the source of truth for SuperTug OOS.

## Simplicity rules (owner's standing direction — do not violate)

1. **No advanced motion.** No screen-slide/push-pop animations, no parallax, no staggered
   entrances, no scroll-snap carousels with paddles, no video, no blur choreography. The ONLY
   motion allowed: press/active states, and simple color/opacity/transform transitions of 320ms or
   less. Screens change instantly; content never "arrives."
2. **No emojis in the UI.** Plain text first. Where an icon genuinely helps, use a monochrome
   inline SVG line icon (24-box, stroke 2, round caps) or a typographic glyph (✓ ✕ ⚠ › ▲ ▼).
   Never a color pictograph.
3. **Keep components basic.** Tiles, cards, chips, fields, grouped list rows, banners, stat cards —
   that's the whole vocabulary. If a screen seems to need something fancier, simplify the screen.
4. **Every screen still gets a back button** (via `UI.render`) and one clear primary action.

## Conventions

- Storage keys are namespaced `elt.*`. Real employee names never ship in source; demo mode
  (`elt.demo`) masks names on screen.
- Deploy = bump `sw.js` `CACHE` + add files to `CORE`, commit, push.
- Test UI changes in a real browser (Chromium at `/opt/pw-browsers/chromium-1194/...`) before
  claiming done.
