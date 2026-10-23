# CareLog

**A shared care record for families who take turns looking after someone.**
Who did what, a clear handover when care passes from one person to the next, and open items that never quietly disappear.

- **Live app:** https://carelog-sigma.vercel.app
- **Requirements the browser suite is generated from:** [docs/PRD.md](docs/PRD.md)
- **Try it:** create your own account on the sign-in page. No email is sent and no real data is needed; use made-up names.
- **Built for:** TestSprite Hackathon Season 4

## The problem

Three siblings share the care of their father. They coordinate in a group chat and a paper notebook. Nobody can answer "did Dad have his 2pm tablets?", two people might each give a dose, a note about dizziness never reaches the next person, and "someone should book Thursday's transport" is said once and forgotten.

CareLog gives everyone the same record, written under their own name, and makes the *handover* the main event.

## What it does

| Area | Behaviour |
|---|---|
| **Records** | Each scheduled item can be completed once. A second attempt is refused and shows who already recorded it. A real second administration can still be reported truthfully as a flagged exception with an explanation. |
| **Honest about uncertainty** | A passed time with nothing recorded shows *"Scheduled time passed; no administration recorded"*, never "missed". |
| **Corrections** | Entries are never overwritten. A correction keeps the original, the author and the reason. Both *reported* time and *entered* time are stored. |
| **Handoffs** | Prepare a handoff of what was recorded, what has no record, and every open item. The incoming person acknowledges the handoff. If something is corrected afterwards it is flagged *"Updated since you reviewed"*. |
| **Open items** | Stay on every handoff until someone records an outcome. Acknowledging a handoff never completes them. |
| **Care circle** | Roles: owner, family caregiver, paid carer, clinician (read-only, time-limited), neighbour, recipient. Membership is re-checked on **every request**, so removing someone takes effect immediately even for an open session. |
| **Emergency packet** | A read-only, expiring, revocable link with medicines, allergies, recent entries and contacts. Private notes never appear. |
| **Quick log** | Type "gave Dad his morning medication at 8am" and it becomes the right record (deterministic parser, no AI needed). |
| **Money** | Shared costs split equally in whole cents; balances always sum to zero. |
| **Care load** | Hours per person, a nudge when one person carries most of it, shift and respite logging, and private caregiver check-ins. |
| **Appointments** | Who is taking them. An appointment nobody is taking becomes an open item. Calendar (.ics) download. |
| **Supplies** | Low stock opens a refill item once; restocking closes it. |
| **Devices** | Pill-box or fall-detector webhooks log *observations or incidents*, never proof a dose was given. |
| **Digest, patterns, export** | Weekly summary built from stored records, repeated-word pointers ("dizzy" noted 3 times) with a clear non-diagnosis note, and a doctor-friendly export. |
| **AI (optional)** | With `ANTHROPIC_API_KEY`, handoff summaries and translation are available. The facts always come from stored records, every line is source-linked, and a human reviews the draft. Without a key the app works fully and says so. |

### What it deliberately does not do

It records what people enter. It does not recommend doses, judge whether a dose is safe, diagnose, or replace a clinician. It cannot prove a dose was given, only that someone said so.

## Test strategy (what the suite covers)

Tests run at three levels. The TestSprite suite gates every pull request.

### TestSprite: 32 browser tests on every pull request

Every pull request gets its own Vercel preview. When the preview is ready, the TestSprite GitHub App runs all 32 tests against it and reports a **TestSprite V3** status. Branch protection on `main` requires that status, admins included, and TestSprite's merge gate turns any failed test into a blocked merge.

| Area | Tests |
|---|---|
| Accounts | create an account, sign in, create a circle and land on Today |
| Care circle setup | create a circle with the example schedule |
| Today | record a scheduled dose as given, quick-log a medication, add a free-form note |
| Handoff | prepare a handoff, see recorded care included, a second person reviews and acknowledges it |
| Open items | add, assign to yourself, close with an outcome |
| Timeline | newest-first order, correct an entry and keep the history |
| People | invite a caregiver; remove one and confirm they lose access (two accounts in one test) |
| Emergency packet | create, open and revoke a share link |
| Documents | add a document, include it in the emergency packet |
| Appointments | owned vs unowned (unowned becomes an open item) |
| Supplies | track a low-stock item, restock and close the refill work |
| Care load | log a shift and see it in history, save a private check-in |
| Money | add an expense, review the list |
| Notes | private observation, incident note |

Tests that change data start by creating a brand-new care circle, so runs never depend on what earlier runs left behind.

### Repository tests (`npm test`, 39 tests)

The rules browser clicks cannot reach:

- Concurrent submissions for one scheduled item create exactly one completion.
- Two people racing to accept one invite: exactly one gets in.
- A removed caregiver's still-valid session is rejected on reads, writes and export.
- People outside a circle cannot tell whether it exists (404, not 403).
- Private entries never reach paid carers, clinicians, handoffs, exports or the emergency packet.
- Clinician access is read-only and expires on its own.
- Corrections preserve the original, author and reason; acknowledgement refers to the version reviewed.
- Open items survive acknowledgement and persist across handoffs until an outcome is recorded.
- Money splits never lose or invent a cent.
- Device events never count as an administration.
- Signing out ends only the current session.
- Form times are read in the circle's timezone, including across daylight-saving changes.

### Playwright (`npm run test:browser`, 4 journeys)

Every workspace section, persistent records and phone, tablet and desktop layouts, run locally against an isolated database.

## What TestSprite caught

Each of these was a real defect in the app, found by a failing TestSprite test and fixed in code:

1. **Signing out signed you out everywhere.** Tests running in parallel on one account kept hitting "Please sign in" mid-test. The cause: sign-out deleted every session for the user, so one device logging out logged out all the others. Fixed in [PR #4](https://github.com/IamHarrie-Labs/carelog/pull/4): sign-out now ends only the current session.
2. **Restocking closed the refill job too early.** A restock that still left the item below its low-stock level closed the open "refill" item anyway. Fixed in PR #4.
3. **Logged shifts were invisible.** Logging a shift updated the totals, but nowhere showed the shift itself. PR #4 added a shift history.
4. **Times shifted by an hour.** A shift typed as 14:00 to 15:00 showed as 15:00 to 16:00 when the device's timezone differed from the circle's. Forms now read times in the circle's timezone (shifts and appointments). Fixed in [PR #2](https://github.com/IamHarrie-Labs/carelog/pull/2).

PR #4 went from 26 passed, 3 failed, 3 blocked to 31 of 32 after these fixes.

## Honest gaps

- **Shared database.** Preview deployments use the same Turso database as production. Tests create fresh circles to stay isolated, but test records accumulate under the test account. Judges' own accounts and circles are private and unaffected.
- **Run-to-run variance.** On the same code, full runs have ranged from 29 to 31 of 32. The failing tests move between runs. The most frequent are the two-person handoff test (two accounts in one flow) and a check for a brief "Saved privately." confirmation that sometimes disappears before the agent looks.
- **Gate timing.** The merge gate and required check were switched on after PRs #2 and #4 merged. Those PRs show the red-to-green loop; the gate applies to everything after them.
- **Private check-ins** show only a count on the shared page, by design. The test checks the count, not the note.

## Run locally

```bash
npm install
npm run seed     # optional: synthetic demo data
npm start        # http://localhost:3000, data in ./carelog.db
npm test
```

Node 22.13+ required.

## Deploy

CareLog runs on **Vercel** with a **Turso** (libSQL) database, so every pull request can get its own preview that TestSprite tests.

1. Create a Turso database; note its URL and an auth token.
2. Import the repo in Vercel. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (and optionally `ANTHROPIC_API_KEY`).
3. In Vercel project settings, turn **Deployment Protection off** for preview deployments, otherwise TestSprite cannot reach them.
4. Run `npm run seed` once against the Turso URL to create the demo circle.

## Architecture

- `src/` — Hono API on libSQL. `core.js` holds the access check that runs on every request; `handoffs.js` and `extras.js` hold the features.
- `public/` — dependency-free browser app. All user text is inserted with `textContent`.
- `api/[...path].js` — Vercel entry point. `test/` — API and rule tests.
- Every interactive element has a stable `data-testid`.

## Roadmap

The same record works anywhere responsibility for a person changes hands: newborns shared between parents and grandparents, children moving between two homes, recovery after surgery, dementia care, home-care agencies, and hospital discharge. Starting schedules for several of these already ship as templates.

## Privacy

Use synthetic data in any public demo. Real health information needs a proper data-protection review before real families use this.

## Editorial frontend

The approved cream, forest and sage design is implemented across the public landing, account forms and all care sections. Brand assets and font files are self-hosted. Sign in at `/#/login`; create an account at `/#/signup`. The TestSprite account forms retain their `data-testid` hooks.

Run `npm run test:browser` for the Playwright journey. It starts a local app with an isolated `browser-tests.db`, creates synthetic users, verifies persistent care records, visits all 12 sections and checks phone/tablet/desktop layouts. The default browser channel is Edge; set `PW_CHANNEL=chrome` if using installed Chrome. API tests remain `npm test`.

The landing was rebuilt from a measured section audit of the supplied Wispr Flow reference. The 36 reference captures and measurements are indexed in [docs/reference-audit/README.md](docs/reference-audit/README.md). EB Garamond and Figtree are locally hosted under their included licenses. The existing CareLog logo master is unchanged.

CareLog opens in your browser. Sign in to view your circle, or create an account to start one. The landing page uses the same logo as account and workspace pages.
