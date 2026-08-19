# EWR MT HUB — build guide

An offline-first PWA for United's EWR ground-ops move team. Vanilla JS, no framework, no build
step. This file is the **design language** (how things look) and the **function language** (how
things are structured) so every screen stays uniform — no more "continuation page with no back
button, everything discombobulated."

## Files / modules

| File | What it owns |
|------|--------------|
| `index.html` | App shell, brand header, the view/tab system, and (still) the equipment / inventory / GSE / movement / settings features. The big legacy file — being peeled apart over time (see Migration). |
| `store.js` | `window.Store` — the localStorage/remote persistence seam (`getJSON/setJSON/getRaw/setRaw/del`). |
| `staffing.js` / `staffing.css` | Manpower / staffing feature (its own module, loaded by the shell). |
| `ui.js` / `ui.css` | **The shared UI kit** — the design + function language below. Everything new builds on this. |
| `requests.js` / `requests.css` | Cross-department Send/Receive requests. The **reference implementation** of the UI kit. |
| `sw.js` | Service worker. Bump `CACHE` (`elt-vNNN`) on every deploy and add any new file to `CORE`. |

## Design language (`ui.js` / `ui.css`)

Build markup from these component helpers instead of hand-writing HTML, so everything matches:

- `UI.tile({icon,title,sub,tone,attr})` — big action tile (`tone`: `navy` default, `teal`, `slate`).
- `UI.card(html)` — standard white card.
- `UI.field({label,id,value,placeholder,inputmode})` — labelled text input.
- `UI.chips(items, current, attr)` — a wrapped row of selectable chips. `items` = `["A"]` or
  `[{v,label}]`; `attr` is the data-attribute name used to read the pick back.
- `UI.esc(s)` — HTML-escape.

Colours/spacing come from the site tokens in `index.html` `:root` (`--navy`, `--navy-d`, `--card`,
`--line`, `--ink`, `--muted`, `--good`…). Use those variables; never hard-code a hex that a token
already covers.

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
UI kit. Order after the current pitch work: equipment → inventory → GSE → movement → settings.

## Conventions

- Storage keys are namespaced `elt.*`. Real employee names never ship in source; demo mode
  (`elt.demo`) masks names on screen.
- Deploy = bump `sw.js` `CACHE` + add files to `CORE`, commit, push.
- Test UI changes in a real browser (Chromium at `/opt/pw-browsers/chromium-1194/...`) before
  claiming done.
