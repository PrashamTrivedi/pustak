# Purpose

Let an owner see their profile exactly as an anonymous visitor sees it, and be in
no doubt about which of the two views they are looking at.

## Original Ask

Task 2 of `taskNotes/profile-polish/taskFindings.md`:

> There should be a way to see the profile as logged in vs public profile

## Complexity and the reason behind it

**3 / 5.** The mechanism is small — one query parameter, one derived boolean —
but this is the spec where a mistake discloses data. `isOwner` currently drives
three independent content decisions in `src/profile.ts`, and a preview that
patches two of the three is a leak that renders normally and looks fine. The
score reflects the care the change needs, not its size.

## Architectural changes required

**Separate identity from render mode.** `ProfileModel` gains:

- `asPublic: boolean` — the viewer asked for the stranger's view.
- `effectiveOwner: boolean` — `isOwner && !asPublic`.

`isOwner` keeps its current meaning and is used **only** for chrome: the preview
banner, the view toggle, the `/_browse` return link from spec 1, and the
`Cache-Control` decision in `src/pages.ts:266`. Every decision about *content*
moves to `effectiveOwner`.

The three call sites, all in `src/profile.ts`:

| Line | Today | Becomes |
|------|-------|---------|
| 43 | `if (!isOwner && visibility !== 'public') continue` | `!effectiveOwner` |
| 53 | `indexVisibility !== null && (isOwner \|\| …)` | `effectiveOwner \|\| …` |
| 77 | `model.isOwner ? model.pages.filter(…) : []` | `model.effectiveOwner` |

The property that makes this safe is that the preview is not a second renderer.
It is the stranger's path with one boolean forced, so the preview cannot drift
away from the real public output as the code evolves. Any future change that
introduces a *parallel* "render the public version" function should be rejected
on review for exactly this reason.

**Testability.** `loadProfile` calls `getSessionUser` internally
(`src/profile.ts:31`), which reaches Better Auth and D1, so the model is not unit
testable today. Extract the pure assembly —
`buildProfileModel(user, objects, { isOwner, asPublic, origin })` — leaving
`loadProfile` as the I/O wrapper that fetches the user, resolves the session,
walks the R2 listing, and hands the result to the builder. `src/visibility.test.ts`
already shows the fake-R2 pattern (`R2Like` in `src/visibility.ts:24`) to reuse.

This extraction is what turns the central anti-leak claim into a fast assertion
instead of a manual browser sweep, so it is part of the spec rather than a
nice-to-have.

## Backend changes required

**`src/profile.ts`**

- Read the flag from the request URL inside `loadProfile` — `?as=public` — so the
  route in `src/pages.ts` stays a one-liner. Treat any value other than the exact
  string `public` as absent; do not accept a bare `?as`.
- Compute `effectiveOwner` once and thread it through the listing loop and the
  about gate.
- Emit the preview banner and the toggle from `profileHtml` based on `isOwner`
  and `asPublic`.

**`src/pages.ts`, in `serveOrProfile` (line 258)**

- When the preview flag is set, add `X-Robots-Tag: noindex, nofollow`. A preview
  URL will get pasted into a chat sooner or later; it must not be indexable.
- Add `<link rel="canonical">` to the bare profile URL in the preview so the two
  URLs do not compete as duplicate content. Rendering it in `profileHtml`
  alongside the existing meta tags (`src/profile.ts:69`) is simpler than
  post-processing the response.
- Leave `Vary: Cookie` as-is and keep `Cache-Control: private, no-store` keyed on
  `isOwner`. A preview response still varies by session — it carries the banner —
  so it must not be shared-cached.

**A stranger passing `?as=public` must be a no-op.** For them `isOwner` is
already false, so `effectiveOwner` is false either way, no banner renders, and
the output equals the ordinary public profile. The parameter therefore needs no
gating, no authentication check, and no error path. Confirm this rather than
assume it — it is acceptance criterion 4.

## Frontend changes required

**In the owner view:** a control reading along the lines of "See what a visitor
sees" linking to `?as=public`. Place it with the footer actions or beside the
public section heading — near the thing it explains, not buried at the bottom.

**In the preview:** a persistent banner that cannot be mistaken for the owner
view. The existing `.owner-banner` style (`src/profile.ts:114`) is the right
visual weight and already carries the sindoor border; reuse it rather than
inventing a second treatment. The banner states that this is the visitor's view
and links back to the bare `/<username>`.

The banner is the only owner-specific element in the preview. Everything below it
is the stranger's markup.

## Acceptance Criteria

1. `GET /<username>?as=public` as the owner renders the public profile plus a
   preview banner and nothing else owner-specific.
2. The body of that response, minus the banner, canonical link, and robots meta,
   is byte-identical to what an anonymous visitor gets for `GET /<username>`.
3. No unlisted or private path, and no count of them, appears in the preview HTML.
4. A stranger passing `?as=public` gets the ordinary public profile, with no
   banner and no error.
5. If `index.html` is not public, the about frame is absent from the preview even
   though the viewer owns it.
6. The banner links back to the owner view and the owner view links into the
   preview.
7. Preview responses carry `X-Robots-Tag: noindex, nofollow` and a canonical link
   to the bare profile URL.
8. Owner profile responses keep `Cache-Control: private, no-store` and
   `Vary: Cookie`, in the preview as well as the normal view.
9. `/<username>/` and `/<username>/index.html` are unaffected.
10. Unit tests cover the four viewer/flag combinations; `npm run typecheck` clean.

## Validation

**Unit**, against the extracted builder, with a faked listing holding one page of
each visibility plus an `index.html`:

- owner without the flag: three pages, counts populated, about present.
- owner with the flag: one page, no counts, about present only if `index.html`
  is public.
- stranger: deep-equal on content fields to the owner-with-flag case.
- stranger with the flag: deep-equal to stranger.

The third assertion is the one that matters; write it as an explicit
deep-equality over the content fields rather than a set of spot checks, so a
future field added to the model is covered by default instead of quietly escaping.

    npm run typecheck
    npx tsx --test src/*.test.ts

**Local**, via `npx wrangler dev`, signed in with one page of each visibility:

1. Open `/<user>` — see all three pages.
2. Follow the preview toggle — see only the public one, plus the banner.
3. Follow the banner back — all three return.
4. Sign out, open `/<user>?as=public` — ordinary public profile, no banner.

**Live**, after deploy, with the owner cookie in `$C`:

    diff <(curl -s -H "cookie: $C" 'https://pustak.prashamhtrivedi.app/<user>?as=public') \
         <(curl -s              'https://pustak.prashamhtrivedi.app/<user>')

Differences confined to banner, canonical, robots. A stored path on one side only
is a failure.

    curl -sI -H "cookie: $C" 'https://pustak.prashamhtrivedi.app/<user>?as=public' \
      | grep -iE 'x-robots-tag|cache-control|vary'

**Deploy** with `env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_API_KEY -u CLOUDFLARE_EMAIL npx wrangler deploy`
— the environment token lacks Workers write and shadows the working OAuth login.
