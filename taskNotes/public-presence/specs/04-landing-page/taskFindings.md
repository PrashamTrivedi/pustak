# Purpose

Replace the login wall a signed-out stranger hits at `/` with proof of what
Pustak does.

## Original Ask

Spec 4 of `taskNotes/public-presence/taskFindings.md`. Contract:
`taskNotes/public-presence/requirements.md`, section 3. Origin: the CoS options
brief.

## Complexity and the reason behind it

**2 / 5.** One route change and one rendered page. The care goes into the copy
and into not regressing the signed-in path, not into the mechanism.

## Architectural changes required

None. `src/pages.ts` already branches on the session at `/`; the anonymous arm
stops redirecting to `/_login` and returns the landing instead. The signed-in arm
is untouched.

## Backend changes required

- New `src/landing.ts` exporting the renderer.
- `src/pages.ts`: `dashboard()` returns the landing for an anonymous visitor
  rather than redirecting. `/_browse` keeps redirecting to login, since it is the
  bucket browser and has no meaning without an account.

## Frontend changes required

The landing carries, in this order:

1. One sentence naming the problem Pustak solves.
2. Three short beats — it stores your pages, it serves them, an agent can write
   them.
3. A prominent callout linking to `/prash-h-trivedi` as live proof.
4. Sign-in and create-account, as the second step.

The proof link points at a real profile with real public pages on it. No
screenshots standing in for the product.

**Prohibited, carried from the CoS brief and not negotiable:** no hire-me call to
action of any kind; nothing that promises a stranger they can see something and
then asks them to log in; no published link that previews as broken.

Palette and type come from the shared constant lifted out of `src/ui.ts` in spec
1, so the landing, dashboard, profile and 404 stay one visual system.

## Acceptance Criteria

1. Anonymous `GET /` returns the landing with 200, not a redirect.
2. Signed-in `GET /` returns the dashboard, exactly as before.
3. The proof callout links to a profile that a signed-out visitor can open and
   that has public pages on it.
4. Sign-in appears after the proof, not before it.
5. No hire-me language anywhere on the page.

## Validation

```bash
npm run typecheck
curl -sI "$BASE/"                    # expect 200, not 302 to /_login
curl -sI "$BASE/" -H "cookie: $C"    # expect the dashboard
curl -s  "$BASE/" | grep -i -E 'hire|freelance|consult|available for'  # expect nothing
```

Then the stranger test itself, which is the real gate: open `$BASE/` in a private
window with no session and time how long it takes to understand what Pustak does
and to reach visible proof. Ten seconds is the bar. Follow the proof link and
confirm it opens without a login.
