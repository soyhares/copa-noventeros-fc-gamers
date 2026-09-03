# CLAUDE.md

## Project

Static web app for running FC26 tournaments among friends. Spanish-language UI.
No build step, no package manager, no tests, no backend of our own — Firebase
Firestore holds all state, GitHub Pages serves the files.

Run locally with any static server (`python3 -m http.server`) — opening
`index.html` via `file://` breaks the ES module imports.

## Files

- `index.html` — shell only: topbar, empty `<main id="main">`, bottom tabbar (home / register / tournament / admin).
- `app.js` — everything: Firestore access, tournament model, draws, standings, bracket, CSV, all rendering.
- `style.css` — dark + neon-green theme, CSS vars in `:root`.
- `firebase-config.js` — the user's own Firebase keys. The apiKey is **not** a secret and is meant to be committed.

## Architecture

Two Firestore documents drive the whole app:

- `meta/config` → `INDEX`: `{ tournaments:[…summaries], activeId, adminPin, validTeams:{clubs,countries} }`
- `tournaments/{id}` → `CURRENT`: the full active tournament (see `blankTournament()`)

Plus `meta/history` for archived tournaments.

`onSnapshot` listeners on both docs re-render on any remote change
(`attachTournamentListener` / `attachIndexListener`). Both bail out via
`isTypingNow()` so a live update doesn't wipe a field someone is typing in.

Rendering is `innerHTML` template strings into `#main`, then handlers assigned
imperatively (`el.onclick = …`) right after. There is no framework, no vdom, no
component layer — `render()` dispatches on the `VIEW` global and repaints the
whole view. Follow that pattern; don't introduce a framework or a state library.

Writes go through `saveIndex()` / `saveTournament(t)`, which set the whole
document. There are no partial updates and no transactions.

`fGet`/`fSet`/`fDelete` do **not** swallow Firestore errors — they let them throw.
A caller that doesn't await/handle a write's promise gets an unhandled rejection,
which the global `window.addEventListener('unhandledrejection'/'error', …)` catches
and turns into a generic "algo salió mal" modal (`mostrarErrorGlobal()`). This is
deliberate: an earlier version swallowed write failures silently, so a dropped
connection mid-save looked successful locally and only reverted once the next
real sync arrived. Don't reintroduce a try/catch around fSet/fDelete that
returns `false` instead of throwing — that brings the silent-failure bug back.

Any write-triggering button should be wrapped in `conCarga(boton, texto, accion)`
— disables the button and shows a spinner for the duration, restores it in a
`finally` (even on failure). Inside such a handler, capture any DOM elements
you'll write to **before** the first `await` (into local consts), not via a
fresh `document.getElementById(...)` after — a concurrent remote write can
trigger a re-render mid-await (`onSnapshot` doesn't wait for you), replacing
`#main` and making a later `getElementById` return `null`. A captured reference
to a since-detached node is still safe to write to (silently a no-op).

## Tournament lifecycle

`status`: `registration` → `closed_reg` → `drawn` → `groups` → `playoffs` → `finished`.

Al cerrar inscripciones, `formatoAjustado()` baja el `size` al mayor de 8/16/32 que quepa
con los inscritos (mínimo 8); los que sobran pasan a `t.waitlist` por orden de llegada, sin
borrarse. Esto existe porque `buildBracketFromGroups()` toma 2 clasificados por grupo y
revienta si un grupo tiene menos de 2 jugadores.

Sizes are 8/16/32 → always groups of 4 (`size/4` groups, letters A–H), full
round robin inside each group, top 2 advance into the bracket built by
`buildBracketFromGroups()`. `tryAdvanceBracket()` fills the next round as
results come in.

**`t.bracket.rounds` is `[{partidos:[…matches]}, …]`, never a bare array of arrays.**
Firestore's `setDoc` rejects any document containing an array whose elements are
themselves arrays ("Nested arrays are not supported") — this only surfaces at the
real `setDoc` call, so a hand-rolled/in-memory Firestore stub used for testing won't
catch it. This bit the app in production: `buildBracketFromGroups()` used to set
`rounds:[round0]` (an array of plain match arrays) and every attempt to generate the
bracket failed silently-ish (a thrown `FirebaseError` from deep inside the SDK).
When touching bracket code, keep every array nested inside an object, never directly
inside another array — same restriction would apply to `groups`/`groupMatches` if
their shape ever changes.

Registration validates alias/club/country against `INDEX.validTeams` and
rejects duplicates (`aliasTaken` / `clubTaken` / `countryTaken`).

## Conventions

- Spanish for anything user-facing (UI strings, README). Code identifiers are English.
- Keep it dependency-free. Firebase is loaded from the gstatic CDN as an ES module; that's the only dependency.
- The admin PIN is deliberately weak — it's a speed bump between friends, not auth. Don't rebuild it as real security unless asked.
- Firestore rules are intentionally wide open (see README). Same reasoning.
