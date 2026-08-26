# Operational Success — Design Language & Function Language

*The complete spec for how every screen in the app looks (design language) and how every screen
is built (function language). This is the document that keeps ten features feeling like one
product — hand it to anyone who builds on the app, including Digital Technology.*

*App: an offline-first PWA for United EWR ground ops. Vanilla JS, no framework, no build step.
Reference implementation of everything below: `requests.js`. The kit itself: `ui.js` / `ui.css`.*

---

## Part 1 — The Design Language (how it looks)

### 1.1 The idea

Apple-structured, United-skinned. The structure (spacing rhythm, radius ladder, type scale,
restraint) follows Apple's product-page discipline; the skin (color, voice) is United's. Every
value below lives as a CSS token in `index.html` `:root` — **never hard-code a hex a token
covers.**

### 1.2 Color tokens — the United palette

| Token | Value | Role |
|---|---|---|
| `--ua-blue` | `#0033a0` | United Blue — links, chips, selected states, outlines |
| `--ua-action` | `#1414d2` | Action blue — the CTA color. Primary buttons only |
| `--ua-navy` | `#0a1f44` | Deep navy — grounds: tiles, stat cards, hero surfaces |
| `--ua-navy-deep` | `#001840` | Darkest ground (lock screen, presentation) |
| `--ua-purple` `--ua-lavender` `--ua-sky` `--ua-plum` | `#6244bb` `#cfc4f2` `#a6e3f5` `#5c1f4b` | Tile accent family |
| `--ua-red` | `#c8102e` | Failure/danger ONLY — couldn't-park, OOS, delete. Never for workload counts |
| `--ua-green` | `#008009` | Success — parked, confirmed, complete |
| `--ua-amber` / `--ua-amber-text` | `#f5a623` / `#b45309` | Status amber — warnings, waiting states, notes |

**Neutrals (warmed):** `--bg #f7f4f0` (page), `--bg-inset #efeae3`, `--card #fff`,
`--ink #0a1f44` (text), `--muted #5c6470`, `--line #e2dcd3`, `--hairline rgba(0,24,64,.14)`.

**On-dark set** — colors have different jobs on navy grounds: `--dk-muted #96a3bd`,
`--dk-link #a6e3f5`, `--ok-dark #3ddc74`, `--bad-dark #ff5a5c`. *Rule: never paint `--ua-red`
onto navy — that's what `--bad-dark` exists for.* The warn wash is exactly one value: `#fdf2e2`
with `--ua-amber-text` ink (the `ui-banner--warn` pair).

### 1.3 Radius ladder, shadows, hit targets

- Radius: `--r-xs 6` · `--r-sm 10` · `--r-md 12` (cards, fields, banners) · `--r-lg 18`
  (stat cards) · `--r-tile 22` (home tiles) · `--r-pill 980` (chips, pills, small buttons).
  A surface takes the radius of its tier — a card never wears the tile radius.
- Shadows: `--shadow-1` for resting cards, `--shadow-2` sparingly, `--shadow-modal` for sheets.
- Touch: `--hit 44px` minimum everywhere; rows `--row-h 48px`; fields `--field-h 56px`.
  Gloves-and-rain screens go bigger: 52–56px targets, 2px borders on ghost buttons so they
  survive sun glare.

### 1.4 Type

System font stack (`--font`). The scale in practice:

| Element | Spec |
|---|---|
| Screen title | 600, ~28px (from `UI.render` header) |
| Tile title | 600 24px, sub 400 14px |
| Row title | 400 17px / sub 400 14px `--muted` |
| **Every label/eyebrow in the app** | **600 12px/1.33, letter-spacing .08em, uppercase** |
| Big figures (gate, percentages) | 600, tabular-nums, sized to the read distance — the truck card's gate is `clamp(48px,13vw,68px)` because it's read from across a cab |

One label spec, everywhere — `ui-flabel`, `ui-stat__eyebrow`, `rq-sechead`, `pt-eyebrow` are all
the same 12px voice. Numbers that get compared are always `font-variant-numeric: tabular-nums`.

### 1.5 Motion budget (three easings, and almost nothing moves)

`--ease`, `--ease-out`, `--ease-enter`; durations 100–400ms. **The simplicity rules cap this
hard:** no screen-slide/push-pop, no parallax, no staggered entrances, no carousels, no video, no
blur choreography. Allowed: press/active states and simple color/opacity/transform transitions of
**320ms or less**. Screens change instantly; content never "arrives."
*The one sanctioned exception:* the 2-second attention pulse (an expanding box-shadow ring) for
things that genuinely demand a human — a 3rd-ask request, a couldn't-park alert, the
"PAATS at the gate" prompt. Use it like a fire alarm: rarely.

### 1.6 The component vocabulary (all of it)

Tiles · cards · chips · fields · grouped list rows · banners · stat cards. **That is the whole
vocabulary.** If a screen seems to need something fancier, simplify the screen. No emojis
anywhere — plain text first; where an icon genuinely helps, a monochrome inline SVG line icon
(24-box, stroke 2, round caps) or a typographic glyph (✓ ✕ ⚠ › ▲ ▼).

Build markup from the kit helpers, never by hand:

- `UI.tile({icon,title,sub,tone,attr})` — big action tile. Tones: navy (default), teal, slate.
- `UI.card(html)` — standard white card.
- `UI.field({label,id,value,placeholder,inputmode})` — labelled input.
- `UI.chips(items, current, attr)` — wrapped row of selectable chips.
- `UI.typeahead(inputEl, listEl, {min, source, onPick})` — live suggestions.
  **Rule: any input backed by a known dataset (aircraft, equipment tags, people) gets one.**
  Pure DOM updates on input; never re-renders the screen, so focus survives.
- `UI.esc(s)` — HTML-escape. Everything user-entered goes through it.

Shared anatomies to reuse before inventing anything: `.ui-row` (+`__main/__title/__sub/__value/
__chev`), `.ui-group`, `.ui-stat` (+`--royal/__eyebrow/__num/__cap`), `.ui-banner`
(`--info/--warn/--urgent`), `.link-more` (the › link). A module may declare a *tier* of a kit
component (e.g. a compact stat card that only changes padding and number size) — it may not fork
one.

### 1.7 Voice

Calm, specific, operational. "Every outcome, kept 14 days." — not slogans. Sub-lines state what
the screen does or the current value ("On · cap 300"), so most visits end without opening
anything. Warnings say what happens next ("Those units move to unassigned — logged in Movement").

---

## Part 2 — The Function Language (how it's built)

### 2.1 The one rule that guarantees uniformity

**Every screen is a function `fn(nav)` that calls `UI.render(...)`. Never render a feature screen
by hand.**

```js
function menuScreen(nav){
  UI.render(container, nav, {
    title:"Requests", sub:"…",
    body:`…HTML built from UI.tile/card/field/chips…`,
    mount:(root)=>{ /* wire event handlers on `root` here */ }
  });
}
```

`UI.render` draws the header (title/sub + **a back button auto-wired to `nav.back()`**), then the
body, then runs `mount`. Because the back button comes from the kit, a "continuation screen with
no way back" physically cannot ship.

### 2.2 Navigation stacks

- `UI.nav(container, {onExit})` → a navigation **stack** for that container.
  `nav.go(fn)` push · `nav.back()` pop (or `onExit` at the root) · `nav.reset(fn)` set root ·
  `nav.refresh()` redraw current · `nav.el` — the stack's container.
- A module exposes `window.FEATURE = { open(){ nav=UI.nav(root,{onExit:goHome}); nav.reset(homeScreen); }, back:()=>nav.back(), refresh:()=>nav.refresh() }`.
- **Shared screen factories** render via `nav.el`, so the same screen (e.g. the inventory-locations
  editor) can be pushed onto whichever stack the user is standing in — Settings' own stack, or the
  GSE stack right next to the data. One implementation, every doorway.
- The app shell routes `goTab("feature")` → `FEATURE.open()` and the global back → `FEATURE.back()`.

### 2.3 Screens re-render; inputs must survive

A screen redraw re-runs its `fn(nav)`. Two disciplines protect typing:

1. **Pure-DOM repaints for live lists**: search filters and add-loops repaint only the list
   container and stat numbers via `innerHTML`/`textContent` — never `nav.refresh()` mid-keystroke.
   The input sits outside the repainted node, so focus never drops.
2. **Focus-guarded mirrors**: every cross-window listener checks `document.activeElement` before
   repainting; if the user is mid-word in this feature's inputs, the refresh is held
   (`pendingRefresh`) and flushed on blur. A teammate's write must never eat a half-typed entry.

### 2.4 Data layer stays in the shell

Feature modules own **screens**; `index.html` owns the **data layer** (load/save/sync, `logMove`,
`commitInv`, pickers, passcode gate `askPass`/`curPass`, pattern lock, sheet builders). Writes go
through shell globals so team-sync signatures, demo masking and normalization stay in one place.
Each module's header comment documents its seam.

### 2.5 Storage & the no-network live mirror

- Every key is namespaced `elt.*`, written through `window.Store` (`getJSON/setJSON/getRaw/
  setRaw/del`) — the localStorage/remote persistence seam.
- Records are **flat arrays of independent objects with ids and `when` timestamps** — never one
  big embedded object (last-writer-wins would clobber a whole roster instead of one entry).
- Deletions travel as tombstones (`{id, del:true, when}`) so another device can't resurrect them.
- A `storage`-event listener per feature makes two windows on one machine mirror each other live
  with **zero network** — this is how every demo runs. Guarded per 2.3.
- Long-lived truths get **frozen summaries** (e.g. per-day PAATS results, 400-day retention) so
  they outlive raw-record purges.

### 2.6 Security postures (use the matching one)

| Gate | Behavior | Used for |
|---|---|---|
| Session-cached code | Ask once per sitting (`askPass` → cache flag) | Settings passcode, SOC access code |
| Fresh every time | Re-ask even mid-session | Destructive/irreversible: delete-all, log wipe, inventory location editor |
| Pattern lock | Draw-to-unlock, session-cached | Equipment editing in the field |
| Never gated | Zero friction | Anything a crew touches in the rain (truck screens) |

The cleartext team passcode never syncs (stripped from the config row before upload). Real
employee names never ship in source; demo mode (`elt.demo`) masks names **and equipment tags**
on screen with stable fakes — data untouched.

### 2.7 Attachments carry an owner

Anything a user attaches (photos…) is stamped with `oosWho()` (the requests "working as"
identity, staffing pick as fallback). Only the owner sees Replace/Remove; everyone else sees a
quiet "Photo by X" caption.

### 2.8 Design-for-the-field defaults

- Optional steps are never gates: the fast path (dispatch now, count now) always works; the richer
  path (ground board, election) is one tap away and never blocks.
- Derive, don't administer: if a boundary can be computed (closures from timestamp gaps, ops-day
  from the clock), never make a gloved human start/end/name it.
- Honest numbers: denominators are defined by what was logged; nothing is fabricated to make a
  percentage look better; exclusions (departed, removed) are shown, not hidden.

### 2.9 Adding a feature — the uniform recipe

1. New module `feature.js` (+ `feature.css` if needed), wrapped in an IIFE, exposing
   `window.FEATURE = {open, back, refresh}`.
2. Build every screen with `UI.nav` + `UI.render` + the `UI.*` components. Nothing hand-rolled.
3. Add `#view-feature` + a home tile in `index.html`; wire `goTab("feature")` and the back route.
4. Persist under `elt.feature.*` through `Store`; add the guarded `storage` mirror.
5. `sw.js`: bump `CACHE` (`elt-vNNN`), add new files to `CORE`. Deploy = bump + commit + push.
6. One concern per file; if a module sprawls, split it.
7. Test in a real browser before claiming done.

### 2.10 The simplicity rules (standing direction — do not violate)

1. **No advanced motion** (see 1.5).
2. **No emojis in the UI** (see 1.6).
3. **Keep components basic** — the seven-piece vocabulary is the whole kit.
4. **Every screen gets a back button** (via `UI.render`) and one clear primary action.

---

## Appendix — module map

| Module | Owns |
|---|---|
| `index.html` | Shell, header, tabs, data layer, gates, sheet builders |
| `store.js` | `window.Store` persistence seam |
| `ui.js` / `ui.css` | The kit — everything above |
| `requests.js` | Cross-dept requests — the reference implementation |
| `staffing.js` | Manpower: boards, tug board, fatigue flags, demo seeding |
| `gse.js` + `equipment.js` / `inventory.js` / `movement.js` | Equipment home + its three sibling screen-modules on one nav stack |
| `safety.js` | Safety home + stop-mark lookup |
| `paats.js` | Lightning dispatch, Ground Board (5AM ops-day), gate map (satellite + drawn boundaries + GPS auto at-the-gate) |
| `hub.js` | Move Team Hub tile grid |
| `settings.js` | "Six Rows, Two Taps" settings + shared catalog editors |
| `present.js` | The built-in editable pitch deck |
| `sw.js` | Offline cache (`CACHE` version + `CORE` list + satellite tile cache) |
