# Purpose

Make a user's own profile reachable, verifiable, and readable: navigate to it
from inside the app, preview it exactly as a stranger sees it, and reorganise it
so what is public is unmistakable and everything else is tucked away.

## Original Ask

> One more thing to plan for profile.... Run codePlanner. Task 1: I need to see
> my profile from the app itself and navigate to it. 2: There should be a way to
> see the profile as logged in vs public profile and 3: Arrange the info in
> better way... Call out public, and probably hide or bury others behind the
> accordion or collapsed section

Constraints carried from the request: stay with the existing server-rendered HTML
approach (no frontend framework), respect the three-state visibility model in
`src/visibility.ts`, and never leak private or unlisted data into the public view.

## Complexity and the reason behind it

**3 / 5.**

Not higher: there is no data-model change, no new auth surface, no migration, and
no new route. Everything lands in two files that already exist (`src/profile.ts`,
`src/ui.ts`) plus a few lines of header handling in `src/pages.ts`. The rendering
is server-side string templating that the codebase already does everywhere, and
the accordion is a native `<details>` element — the same idiom already used at
`src/ui.ts:271`.

Not lower: task 2 changes what a page discloses based on who is asking, and that
is exactly the class of change where a mistake becomes a data leak. The current
`ProfileModel.isOwner` field is doing double duty — it means both "this viewer
owns this profile" and "render owner-only material" — and the preview feature
forces those two meanings apart. Verification is a four-cell matrix (owner and
stranger, each with and without the preview flag) rather than a single happy path,
and one cell of it must be proven byte-identical to another.

## Architectural changes required

**One conceptual change, and it is the safety-critical one: split identity from
render mode in `ProfileModel`.**

`src/profile.ts:17` currently exposes `isOwner`, and three separate decisions
key off it — the listing filter (`src/profile.ts:43`), the about-frame gate
(`src/profile.ts:53`), and the owner-only page group (`src/profile.ts:77`).
Introducing a public preview means the same viewer is the owner *and* must be
shown the stranger's content. Rather than sprinkle `&& !preview` at each of the
three sites — where forgetting one is a silent leak — the model should carry:

- `isOwner` — identity truth. Used **only** to decide whether the preview
  banner and the view-toggle are rendered at all.
- `asPublic` — the viewer asked for the stranger's view.
- `effectiveOwner` — derived as `isOwner && !asPublic`. **Every** content
  decision (what is listed, whether the about frame appears, whether the hidden
  group renders) keys off this and nothing else.

The guarantee that follows is worth stating explicitly, because it is what makes
the feature safe: the preview is not a second renderer. It is the *same* code
path a stranger takes, with `effectiveOwner` forced false. There is no separate
"public rendering" that could drift from the real one.

**Testability seam.** `loadProfile` calls `getSessionUser` internally
(`src/profile.ts:31`), which reaches Better Auth and D1, so the model cannot be
unit-tested today. Extract the pure part — something like
`buildProfileModel(user, objects, { isOwner, asPublic, origin })` — and let
`loadProfile` stay as the thin I/O wrapper that composes it. This is a small
refactor and it is what lets the anti-leak assertion be a fast unit test instead
of a manual browser check. `src/visibility.test.ts` already demonstrates the
fake-R2 pattern to follow.

No routing change. `?as=public` is a query parameter on the existing profile
route, so `serveOrProfile` (`src/pages.ts:258`) keeps its current shape.

## Backend changes required

**`src/profile.ts`**

- Extend `ProfileModel` with `asPublic: boolean` and `effectiveOwner: boolean`.
- `loadProfile` gains the preview flag, read from the request URL rather than
  passed separately, so the route stays a one-liner.
- Repoint the filter at line 43, the `aboutOk` gate at line 53, and the
  `otherPages` split at line 77 onto `effectiveOwner`.
- Add the counts the new information architecture needs (public / unlisted /
  private) to the model, computed from the same listing. Populate them **only**
  when `effectiveOwner` is true — a stranger must not learn how many hidden
  pages exist.

**`src/pages.ts`**

- In `serveOrProfile` (line 258), send `X-Robots-Tag: noindex, nofollow` when the
  preview flag is present, so a shared preview link never enters an index.
- Keep the existing `Vary: Cookie`, and keep `Cache-Control: private, no-store`
  keyed off `isOwner` (identity, not `effectiveOwner`) — a preview response is
  still session-dependent and must not be shared-cached.
- Emit a `<link rel="canonical">` to the bare profile URL from the preview so the
  two URLs do not compete as duplicate content.

**No change** to `src/visibility.ts`, `src/users.ts`, `src/session.ts`, the D1
schema, or the MCP surface. No migration.

## Frontend changes required

All server-rendered strings; no framework, no build step, no client JS beyond
what already exists.

**`src/ui.ts` — the way in (task 1).** The "Signed in" card at `src/ui.ts:261`
already has the username in scope, so `dashboardHtml(username, email)` needs no
signature change. Add a profile link beside `@username` there. That is the
primary entry point; a second link in the footer or colophon row
(`src/ui.ts:248`) is optional reinforcement.

Worth knowing before anyone edits it: the Pustak corner mark in
`src/branding.ts:10` links to `/_browse`, but `injectBranding` returns early for
signed-in viewers (`src/branding.ts:54`), so a logged-in user never sees that
badge. Adding a profile link there would be dead code for the owner. Leave it.

**`src/profile.ts` — the toggle (task 2) and the layout (task 3).**

Owner view, top to bottom: identity block (display name, `@slug`), the canonical
public URL with a copy control, a summary strip calling out the public count with
the hidden counts subordinate to it, the public section (prominent, explicitly
labelled as what anyone can see), then a collapsed `<details>` accordion holding
unlisted and private pages with their existing per-state marks, then footer
actions — back to `/_browse` and "see what a stranger sees".

Stranger view: identity, the about frame if `index.html` is public, the public
pages, and the existing sign-in call to action. **No accordion shell and no
counts of hidden material.** An empty collapsed section that says "only you can
see these" still tells a stranger that hidden pages exist; render nothing.

The about frame keeps `sandbox="allow-scripts"` without `allow-same-origin` —
that null origin is what stops embedded user HTML from reaching the visitor's
session, and it must not be relaxed while moving the element.

`<details>`/`<summary>` is native, keyboard-accessible, and works with JavaScript
disabled, which keeps the server-rendered constraint intact.

## Acceptance Criteria

1. A signed-in user can reach their own profile from the dashboard in one click,
   without typing a URL.
2. The profile page offers the owner a visible way back to `/_browse`.
3. An owner viewing their profile sees a control that switches to the public
   preview, and the preview shows a persistent, unmistakable indication that it
   is a preview, with a way back to the owner view.
4. For an owner, `GET /<username>?as=public` returns a body byte-identical to
   what an anonymous visitor receives for `GET /<username>`, except for the
   preview banner and canonical/robots additions.
5. No unlisted or private path, and no count of them, appears anywhere in the
   preview HTML or in any anonymous response.
6. A stranger passing `?as=public` sees the ordinary public profile — the
   parameter grants nothing and reveals nothing.
7. If the owner's `index.html` is not public, the about frame is absent from both
   the stranger view and the preview.
8. In the owner view, public pages are visually dominant and explicitly labelled
   as publicly visible; unlisted and private pages sit inside a section that is
   collapsed on load.
9. The collapsed section is operable with JavaScript disabled and reachable by
   keyboard.
10. Preview responses carry `X-Robots-Tag: noindex, nofollow`; profile responses
    for a signed-in owner remain `private, no-store` with `Vary: Cookie`.
11. `/<username>/` and `/<username>/index.html` continue to serve the user's own
    page directly, subject to its own visibility — unchanged from today.
12. `npm run typecheck` is clean and the test suite passes.

## Validation

**Static.**

    npm run typecheck
    npx tsx --test src/*.test.ts

The existing suite is 8 tests across 4 suites in `src/visibility.test.ts`, run
through `tsx` under `node:test`. There is no `test` script in `package.json`;
adding one is a reasonable side-benefit of this work.

**Unit — the anti-leak assertion.** Against the extracted pure builder, with a
faked R2 listing containing one page of each visibility:

- owner, no preview: all three pages listed, about frame present when
  `index.html` exists, counts populated.
- owner, `asPublic`: only the public page listed, counts absent, about frame
  present only if `index.html` is public.
- stranger: identical model to the owner-with-`asPublic` case, apart from the
  `isOwner` flag itself. Assert this by deep-equality on the content fields —
  it is the criterion that cannot be allowed to regress.
- stranger, `asPublic`: identical to stranger.

**Local end-to-end.**

    npx wrangler dev

Then, signed in as a user holding at least one page of each visibility:

1. From `/_browse`, click through to the profile — criterion 1.
2. Confirm the hidden section is collapsed on first paint, expand it, confirm
   both unlisted and private pages carry their marks — criteria 8 and 9.
3. Switch to the public preview; confirm the banner, and that the unlisted and
   private entries and their counts are gone — criteria 3 and 5.
4. Return to the owner view; confirm they come back.
5. Disable JavaScript and reload; confirm the accordion still opens.

**Live, after deploy.** The byte-identity check is the cheapest strong proof of
criterion 4 — run it with the owner's session cookie in `$C`:

    diff <(curl -s -H "cookie: $C" 'https://pustak.prashamhtrivedi.app/<user>?as=public') \
         <(curl -s              'https://pustak.prashamhtrivedi.app/<user>')

Expect a difference confined to the preview banner, canonical link, and robots
meta. Any stored path appearing on only one side is a failure.

Header checks:

    curl -sI -H "cookie: $C" 'https://pustak.prashamhtrivedi.app/<user>?as=public' \
      | grep -iE 'x-robots-tag|cache-control|vary'

**Deploy note.** The environment's `CLOUDFLARE_API_TOKEN` lacks Workers write
permission and shadows the good stored OAuth login, so deploys must run as
`env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_API_KEY -u CLOUDFLARE_EMAIL npx wrangler deploy`.

## Specs

Broken down in `taskNotes/profile-polish/specs/specs.md`:

1. `specs/01-profile-nav/taskFindings.md` — reach the profile from the app.
2. `specs/02-view-as-public/taskFindings.md` — owner view versus public preview.
3. `specs/03-profile-ia/taskFindings.md` — call out public, collapse the rest.

## Relationship to prior work

This builds on spec 3 of the completed `public-presence` task
(`taskNotes/public-presence/specs/03-profile-pages/taskFindings.md`), which
established the profile route, the sandboxed about frame, and the owner/stranger
split. That directory is left intact rather than versioned to v1: it documents a
seven-spec body of work of which the profile is one part, so versioning the whole
thing to describe a change to one of its pieces would misfile the other six.
