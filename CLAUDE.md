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

## Tournament lifecycle

`status`: `registration` → `drawn` → `groups` → `playoffs` → `finished`.

Sizes are 8/16/32 → always groups of 4 (`size/4` groups, letters A–H), full
round robin inside each group, top 2 advance into the bracket built by
`buildBracketFromGroups()`. `tryAdvanceBracket()` fills the next round as
results come in.

Registration validates alias/club/country against `INDEX.validTeams` and
rejects duplicates (`aliasTaken` / `clubTaken` / `countryTaken`).

## Conventions

- Spanish for anything user-facing (UI strings, README). Code identifiers are English.
- Keep it dependency-free. Firebase is loaded from the gstatic CDN as an ES module; that's the only dependency.
- The admin PIN is deliberately weak — it's a speed bump between friends, not auth. Don't rebuild it as real security unless asked.
- Firestore rules are intentionally wide open (see README). Same reasoning.
