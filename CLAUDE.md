# SYNERGY: notes for Claude Code

Private social fitness-gaming web app for a small group of friends (about 10 people). Installable PWA, hosted free on GitHub Pages, shared data in Supabase.

## The person you are working with
- Owner is Sam (GitHub: ThunderBlaade) on a Windows PC, also iPhone and iPad. Not a developer: give exact click-by-click or copy-paste steps, name the button, say what they should see. Keep replies short.
- Money rule: nothing may cost money or need a card or trial. Free tiers only.
- Always ask before anything destructive or that touches Supabase data.

## Live setup
- Repo: github.com/ThunderBlaade/SYNERGY (renamed from synergy; old address redirects). Branch: `main`.
- Site: https://thunderblaade.github.io/synergy/  (the path must be lowercase). GitHub Pages deploys from `main` / root; a push goes live in 1-2 minutes.
- Supabase project ref: `mqbmhwvmdtotypjlhhya`  (URL https://mqbmhwvmdtotypjlhhya.supabase.co).
- `config.js` holds the project URL and the *publishable* key. These are public by design; the database rules protect the data.
- NEVER commit or paste a `service_role` / secret key, the database password, `.env` files, or zips (see `.gitignore`).

## Files
- `index.html`: the whole app (HTML, CSS, JS in one file). This is the source of truth.
- `service-worker.js`: offline shell. **Bump `VERSION` whenever shell files change.** Pages are network-first, so updates arrive on the next open.
- `manifest.json`, `icons/`: PWA install data.
- `config.js`: Supabase URL and publishable key.
- `supabase/schema.sql`: database setup (safe to re-run). Changing the database means giving Sam new SQL to paste into Supabase SQL Editor, since you cannot run it for them.

## Architecture
- Tabs: HOME / THE GYM / SYNERGY / RANKED / ASTRAL (placeholder) / PROFILE. Sparks replace XP. Home heading shows the user's name. No fake data anywhere.
- Local state `S` is in localStorage key `synergy`.
- Social data goes through one tiny interface, `db.collection(path).onSnapshot(cb, errCb)` and `db.doc(path).set(obj) / .delete()`, with a Supabase implementation (`BE`, `beDb()`, `beInit()`, `beStart()`, `socGo()`). The same app also ran as a Claude artifact on Claude's own database; when `window.top !== window.self` (`STANDALONE` false) it uses that. Keep both paths working.
- Table `docs(path, coll, uid, data jsonb)`; paths look like `s/<uid>` (profile), `s/<uid>/d/<key>`, `s/<uid>/e/<id>`. Row Level Security: any signed-in user can read; you can only write rows under your own uid; the owner (a row in `admins`, checked by `is_admin()`) can also delete. Sign-ups are off in Supabase; users are created by hand in Authentication > Users (email + password, Auto Confirm). The cloud SQL was tested on a throwaway local Postgres but sign-in/sync only against a mocked client plus Sam's real project.
- Known trade-off: any signed-in friend's client can read every row.
- Sign-in: a full-screen gate (`#gate`, `drawGate()`, `gateBody()`) covers the app whenever the device has no session (first open, signed out, reinstall). Modes: `in`, `forgot`, `newpw` (reached from a Supabase recovery/invite email link: URL hash `type=recovery|invite`). The editor previews all three (`SO.prevGate`). `beAccount()` has change password, sign out, sign out of all devices. Click handler is on `[data-be]`. Password reset and invite emails need custom SMTP set up in Supabase (the built-in sender only emails project team members, 2 per hour).
- Editor tool: round button (bottom right) shown only to the owner, or on a device that opened `/#editor` (turn off with `/#editor-off`). Rows: Sky preview, Synergy example, Sign-in page, secret moments simulators. Code: `devDraw()`, `devPanel()`, `devAct()`.
- Sky: `#sky` fixed layer behind `#app`; `applySky()`, `sunTimes()` (NOAA approximation), sun and moon off-screen between each other, moon phase shown in the sun's white. Secret moments in the 30-minute empty-sky gaps (dawn: pterodactyl or car; dusk: spaceship or constellation; golden hen rare), `fxTick()` every 5 s, `fxForce()` for the editor. `#fx` is above the app; `#fxs` (constellation) is behind widgets.
- Elastic scroll drag is an IIFE that moves `#app` with `position:relative; top`. Earlier a transform-based version caused a dark, unclickable screen on Sam's phone, so avoid `transform`/`will-change` on `#app`.

## Style rules (Sam's taste)
- Calm, slightly professional palette (think Co-Star), accent `#7B7EEA`. Apple system font. Liquid Glass widgets (see CSS vars `--lgt --lgs --lge --lgb --lgf`).
- All artwork is flat: solid fills, no gradients, no glows, no outlines. Keep a global rule `#fx svg [fill]:not([stroke]), #fxs svg [fill]:not([stroke]) {stroke:none}`.
- Animations must be smooth (dense keyframes, no piecewise easing). Reduce-motion is ignored only for editor previews.
- Keep the page working offline for everything that does not need the database.

## Working here
- Test by serving the folder locally (`python -m http.server 8000`, then http://localhost:8000/). The service worker only registers on https or localhost.
- Check in a mobile-sized window (390x844). WebKit/iOS behaviour is the main risk: ask Sam to check on the iPhone for anything involving scroll, touch or safe areas.
- Commit small and often. Message style: plain English, what changed.
