# HANDOFF: Build me a pitch presentation for "Operational Success"

You are helping me build a presentation I'm giving to United Airlines leadership in about an hour.
I am a Move Team supervisor at Newark (EWR) who built a working operations app on my own time and
I'm pitching it. Turn this document into a tight slide deck (suggested structure at the bottom).
Everything below is factual about the product; the industry cost figures are approximate and
labeled — frame them as "industry estimates" on the slides.

---

## 1. What it is — one sentence

**Operational Success** is an offline-first web app (PWA) for airport ground operations — built at
EWR, by a working ramp supervisor, that replaces radio relays, paper counts, and Teams screenshots
with live, structured, zero-loss communication between departments.

## 2. The problem it solves

Ground ops at a hub runs on radio calls, paper sheets, and memory:
- A department needs lights/air/stairs at a gate → someone radios, someone writes it on a glove.
  Requests get lost, repeated, or done twice. Nobody can prove they asked three times.
- Equipment goes out of service → GSE (maintenance) finds out hours or days later; nobody knows
  how long a unit has been down, where it is, or what's wrong with it. No photo, no timestamp.
- Management orders an equipment inventory → a supervisor walks the ramp with a printout. There is
  no proof of WHO counted WHAT, WHEN — or what was NOT found.
- During lightning holds, PAATS trucks (guide trucks that bring aircraft in when the ramp is
  closed) get their assignments by radio: aircraft number read out loud, written down, walked to
  the wrong gate. Slow, error-prone, and it's exactly when the operation is most stressed.

## 3. What's in the app today (all working, all demoable)

**Home screen — five tiles:**

1. **Move Team Hub** — the supervisor's toolkit:
   - Manpower/staffing board: upload the roster, tap-assign tugs and areas, fatigue flags
     (7-days-straight warnings), dispatcher assignment, printable/shareable board, drafts.
   - Briefing & focus notes, End of Shift report generator, Aircraft Secure Log, aircraft
     lookup (full fleet database: 1,500+ ships, tail ↔ ship ↔ type).
2. **Requests** — cross-department send/receive:
   - A request reads in one sweep: WHO is asking (department brand colors) → WHAT they need →
     WHERE (gate big, aircraft + type under it). Auto-resolves tail numbers against the fleet.
   - Send to one department or **to All** (broadcast). Receivers mark Done or Can't-do with a
     reason; the sender sees the outcome live. **Resend escalation**: 2nd request shows an amber
     pill, 3rd+ turns red and the home tile pulses — nobody can say they didn't see it.
   - One tap copies any request as a clean image for Teams.
3. **GSE — the equipment home** (the newest, biggest piece):
   - **Global equipment list**: ~200 units with specs (kVA / V / Hz), tags, categories,
     locations, full per-unit movement history, photo documentation, passcode/pattern-locked
     editing.
   - **Do Inventory with proof**: choose "One area" (partial) or "Complete inventory". Counting
     is glove-optimized (tap once = here, twice = out of service + reason, three times = clear).
     Every sheet is stamped **Counted by <name> · date · COMPLETE (6/6) or PARTIAL**, and a
     complete inventory lists every unit **NOT SEEN** with its last known location. Managers get
     proof, not promises.
   - **Out-of-service live loop**: mark a unit down → reason chips → the camera opens
     automatically for a photo → the GSE department sees it live (tag, reason, location, photo,
     how long it's been down — oldest un-acknowledged first) → one tap replies "Picked up — on
     our way." Photos are owner-locked: only whoever took it can replace/remove it.
   - The manpower tug board and the equipment records are bridged both ways — a SuperTug marked
     down on staffing lights up for GSE automatically.
4. **Safety** — stop mark lookup (gate stop-mark data by aircraft type) — expanding.
5. **PAATS** — lightning-hold dispatch (brand new, built for this pitch):
   - SOC picks a truck (PAATS 1/2/3), enters gate, aircraft (auto-resolves type from the fleet),
     flight number, task → sends. The truck crew sees a full dispatch card instantly — no radio
     read-backs, no writing on gloves. They acknowledge ("On it"), then log the outcome: Parked,
     or Couldn't park with a reason (equipment blocking the gate, etc.).
   - Every dispatch is logged — a permanent record of what was parked, by which truck, when, and
     what blocked the ones that failed. Zero loss in translation.
6. All of it synchronizes live across devices — and the core works **fully offline** (ramp wifi
   dead spots, airplane mode) because it's an installable PWA with a service worker.

## 4. Technical facts (for the "how" slide)

- Installable PWA: runs on the iPads crews already carry. No app store, no MDM fight.
- Offline-first: everything works with zero connectivity; syncs when it has signal.
- Zero infrastructure cost today: static hosting only. No servers, no licenses, no per-seat fees.
- Built in plain web technology (no frameworks) with a documented design system in United's
  palette and a "function language" that guarantees every screen has a back button and one clear
  primary action — built for gloves, cold, and glare.
- Demo mode masks real employee names for privacy.
- It was designed BY the end user: I run these shifts.

## 5. Money slide — cost of delay (label these as industry estimates)

- Industry/FAA-derived estimates put a delayed narrow-body's direct operating cost around
  **~$100 per minute** (fuel, crew, maintenance, gates; commonly cited range $75–$150/min —
  Airlines for America publishes ~$100+/min). Ask the audience to use their own internal number.
- One avoided 15-minute delay ≈ **$1,500**. One per day at one station ≈ **~$550K/year**.
- Where this app removes delay minutes:
  - Requests: a gate waiting on ground power/stairs/lights is a departure waiting. Structured
    requests with escalation kill the "nobody heard the radio call" delay.
  - GSE loop: a tug that's been dead for 9 days unnoticed is capacity you paid for and don't
    have. Faster OOS → repair turnaround = more working equipment at push time.
  - PAATS: during lightning holds every parked aircraft frees a gate; misheard tail numbers and
    wrong-gate trips cost exactly the minutes that cascade into missed connections.
  - Inventory with proof: supervisors stop spending hours recounting what was already counted,
    and lost/ghost equipment gets found (each GPU/tug is a $30K–$300K asset).
- Soft costs it attacks: misconnects and rebooking from cascading delays, overtime from chaos,
  safety exposure (people outside during lightning), and the audit trail management never had.

## 6. What I'm offering / asking

- Offering: a **working product today** — not a proposal. Built solo, at zero cost to the
  company, already shaped by real EWR shifts. Portable to any station (nothing EWR-specific is
  hard-coded; locations, categories, and departments are all configurable in-app).
- Asking: a pilot — one station, one quarter. Access to crew iPads, a feedback loop with SOC/GSE/
  Ramp, and the data to measure delay minutes and equipment downtime before/after. If the pilot
  proves out, we talk about making it official.

## 7. Suggested deck structure (10 slides)

1. Title: Operational Success — built on the ramp, for the ramp. (My name, Move Team, EWR)
2. The problem: radio + paper + memory (three quick pain stories from §2)
3. What I built: one screen shot of the home tiles, one sentence each
4. Live loop demo: Requests (who → what → where card, escalation pulse)
5. Live loop demo: GSE out-of-service (photo, live see, "Picked up — on our way", age badges)
6. Proof inventory: COMPLETE (6/6) stamp + NOT SEEN block screenshot
7. PAATS: lightning-hold dispatch — zero loss in translation
8. The money: ~$100/min industry delay estimate → what one avoided delay/day is worth
9. Why this works: offline-first PWA, zero infra cost, built by the end user, portable
10. The ask: one-station pilot, one quarter, measure delay minutes + downtime. Q&A.

Tone: confident, operational, zero buzzwords. Short sentences. I'm a supervisor showing my
leadership something that already works — not a vendor selling vaporware. Please generate
speaker notes per slide (60–90 seconds each) and keep the whole thing under 12 minutes.
