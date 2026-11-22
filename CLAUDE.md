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
- Sky: `#sky` fixed layer behind `#app`; `applySky()`, `sunTimes()` (NOAA approximation), sun and moon off-screen between each other, moon phase shown in the sun's white. Secret moments in the 30-minute empty-sky gaps (dusk only: spaceship or constellation; the pterodactyl, flying car and golden hen were removed, their code is unused), `fxTick()` every 5 s, `fxForce()` for the editor. `#fx` is above the app; `#fxs` (constellation) is behind widgets.
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

## Gym, swipe and floor (added later)
- **Pages swipe** like one strip (`psBegin/psPlace/psSettle/psEnd`, block starts "Page swipe"): both neighbours are rendered as `.psf` frames carrying their own backdrop (gym floor clone), the live `#gbg`/`#sky` shifts with the current page, thin `.pgdiv` seam lines, nav line `.nvl` slides and resizes. It only runs on a main tab with no sub-page, not while editing widgets. The page you were on is saved in `S.lastTab`.
- **Gym dashboard**: `S.gd={L:[...],B:[...]}` (top and bottom boxes), items `{k,s,c,r}`; 3 columns x 2 rows per box; sizes t/s/m/l. Engine: `gdLay`, `gdPlan`, `gdCand`, `gdLive` (widgets you drag over move away at once to the nearest free cell). Hold anywhere (or the pencil) = edit mode (`GE`), 6s idle exit, tap outside exits. Top bar: minus (Remove all, keeps Days) and pencil, which becomes a plus (Add box) while editing. Add box is `gbox()`: a bottom sheet that slides up (handle, search field `#gbq`, two-column previews with size flipper arrows; drag the handle down or tap outside to close). The last widget cannot be removed.
- **Floor** (`gbgDraw`, `gbgTex`, `gbgFine`, `gbgCracks`, `gbgGrazes`): concrete texture, cracks, grazes, window light that follows the real sun (`sunPos`, location + time), compass heading (`CP`, `cmpAsk`, needs the Compass permission) and weather (`S.wx`, `wxKind`). Light and dark variants. Editor can simulate with `SKYSIM.min` and `window.__wxsim`.
- **PC**: at width 900px+ with a mouse the app column is 720px and the floor svg `viewBox` widens with the window (`gbgVB`) so the floor art stays phone-sized in the middle and the texture/vignette continue sideways. Left and right arrow keys switch pages (animated like a swipe).
- **Bars**: top `#tbar` and bottom `nav` are both 46px content height. `.gy-fit` height accounts for the iPhone home-bar area.
- **Permissions sheet** `#perm`: location, compass, city choice; each has an offline/no-permission fallback.
- **Service worker**: `VERSION` was found stuck at v39 for a long time because sed bumps silently missed; check it with `grep VERSION service-worker.js` after every bump.
- Not built yet: Apple Health Shortcut route, Fitbit connection, Monitor screen, goal widgets, Astral sky during swipe when Astral is the incoming page.

## Dashboard widget list (definitive, 12 in the Add sheet)
- Gallery flag is `p:1` in `GW`. Gym: `freq` (Workouts completed), `lift` (Total weight lifted), `recs` (Personal records). Activity: `steps acal adur walk run cyc flt`. Social: `streak`, `fstreak`. Older widgets (time, bars, dist, last, cons, level, hist, month, cal, sets, pr, sparks, links) still render if already placed but are not offered. No Nutrition widgets.
- Period widgets (`cyc:1`) cycle Today / This week / This month / This year / All time on tap (`S.gp[k]`, `perR`, `gper`). `streak` toggles weeks/days (`S.gp.su`); `fstreak` cycles all friends then each friend (`S.gp.fs`).
- Records are derived in `recEvents()` from completed sets only: heaviest weight, one-rep max (real single), estimated 1RM (Epley), exercise volume, most reps at a weight (only when that weight was used before), reps, holds, distance, duration, fastest average pace (>= 1 km).
- Health data: no direct Apple Health/Fitbit link (needs a native app / developer app). `S.hd={days:{'YYYY-MM-DD':{steps:{apple,fitbit}}},goal,pref,src}` is filled by `hdImport()` (paste on Profile > Health data, or open `/#hd=<base64url JSON>` from an iPhone Shortcut). Each source keeps its own value per day, re-import replaces, sources are never summed; where the gym app also recorded, a day uses one source (health first). Unavailable shows "Not connected", never 0.
- Streaks: a day counts at 10+ min completed training in the person's own local day (`w.ld`, and `d` on shared events); a week needs one such day. The current unit never breaks a streak until it ends. Friends' days come only from workouts they share to the feed. Shared streak = intersection of both people's qualifying days/weeks.

## New Activity widgets (v221)
- Added to the Add sheet: `tcal` (Total calories, tap today/week), `stand` (Standing hours), `xdist` (Exercise distance, from saved workouts), `swim` (distance + lengths), `wdur` (Workout duration, tap last/longest via `S.gp.wd`), `gps` (route map, tap next route via `S.gp.gr`). `acal` now also taps today/this week (GW `po:'dw'` = allowed periods; `gper` and the `gper` click handler use `po`).
- Walking/running/cycling show pace and speed (`paceInfo`) only when SYNERGY workouts with a distance exist in the period.
- Health import keys added: `totalKcal`, `standHours`, `swimM`, `swimLaps` (HDM `tkcal stand swim laps`).
- GPS: workouts of running/walking/cycling record `route` ([lat,lon] points, 15 m apart) only while active, unpaused and Location already granted (`LP==='granted'`); no surprise prompt. Routes stay on the device. The map is a drawn route on a grid (no map tiles, so no network or cost).
- Test: `node /home/claude/nw_t.js` (screenshots + tap checks; uses sample data in a throwaway context only).

## Live workout view (v236)
- Picking an exercise on the wheel, or tapping the name/time on the Start widget, opens `active()`: a glass panel over the gym page with three swipe pages (scroll-snap `#lvp`): Live numbers (big timer in #7B7EEA, then rows of big number + small caps label, Apple Watch style), Controls (Pause/Resume, Segment, Exercise, Rest 90s, Finish, Abandon), Log (name, exercises and sets, rest timer, finish form). Dots `.lvd`; the page is kept in `LV.p` across renders (`lvRestore()`).
- Live rows only show what the app really measures (time, segment, sets, volume, exercises, GPS distance/pace). No heart rate or calories (no sensor): never fake them.
- The old small Pause/New segment menu (`gsMenu`) was removed.
