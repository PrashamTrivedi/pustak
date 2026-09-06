# Purpose

Give Pustak a public face: three-state page visibility, a profile page at
`/<username>`, and a landing page that proves what Pustak does to a signed-out
stranger — shipped as one change because they are one decision.

## Original Ask

> We need to brainstorm two things as single deliverable. This + below requirement
>
> We need to have user profile pages, Public private toggle.

Where "This" is the CoS options brief for a logged-out proof door (memory
`CoS options: pustak public landing (not the plan)`), and the brainstorm that
followed is finalized in `taskNotes/public-presence/requirements.md`. That
document is the contract; this one is how it gets built. Followed by:

> /codePlanner On that

## Complexity and the reason behind it

**4 / 5.**

Not lower, because this is not one feature. It changes the storage contract for
every object in the bucket, adds three new public surfaces (profile, landing,
branded 404), changes the meaning of an existing URL shape (`/<username>`),
touches the MCP tool schemas that external clients have already registered
against, and carries a hard external acceptance criterion — a working LinkedIn
preview — that prior evidence says may be blocked outside this repository.
Verification is the expensive part: several criteria are about what a *signed
out* visitor sees, which cannot be checked from a logged-in dev session.

Not a 5, because there is no new infrastructure. No new binding, no schema
migration, no data backfill (see the architecture note below — absence of
metadata *is* the migration), no third-party service, and no framework change.
The codebase is 1,958 lines across 14 files, all of it read and understood. Each
of the seven specs below is independently shippable and independently testable.

## Architectural changes required

### 1. Visibility lives in R2 object metadata, and absence means unlisted

Each stored object gains a `visibility` key in its R2 `customMetadata`, holding
`public`, `unlisted`, or `private`. The bucket already carries `owner` there
(`src/pages.ts` upload handler), so this is an existing mechanism, not a new one.

**Why R2 metadata and not a D1 table.** Serving a page is currently a single R2
`get`, and `customMetadata` arrives with that same call — so enforcing
visibility costs zero extra round trips on the hottest path in the product. A D1
table would add a database read to every public page view. Listing is equally
free: `BUCKET.list({ include: ['customMetadata'] })` returns visibility inline,
so building a profile is one list call, and `src/pages.ts` already uses the
`include` option for `httpMetadata`.

**Why absence means unlisted, and why that matters.** Every object written
before this ships has no `visibility` key. Reading a missing key as `unlisted`
makes the requirements' migration rule — every existing page becomes unlisted —
true the moment the code deploys, with no backfill script, no migration window,
and no possibility of a partially-migrated bucket. There is nothing to run and
nothing to roll back.

**The cost, stated honestly.** R2 has no metadata-only update. Changing a page's
visibility means reading the object and writing it back with new metadata. That
is acceptable because toggling is rare and pages are small HTML documents, but
the implementation must preserve `contentType` and `owner` across the rewrite or
it will silently corrupt them. This is the single most likely bug in the whole
change; the spec calls for it explicitly.

### 2. `/<username>` changes meaning

Today a bare single-segment path redirects to its trailing-slash form and serves
that user's `index.html`. After this change, a single segment that matches a
username in D1 renders the profile instead. The D1 lookup happens only for
single-segment paths, so `/<user>/<page>` — the hot path — is untouched.

`/<username>/` and `/<username>/index.html` keep serving the user's own page
exactly as before, subject to its own visibility. Both URLs survive.

### 3. Isolation for the about section

The profile embeds the user's `index.html` in an iframe pointed at that page's
own URL with `sandbox="allow-scripts"` and deliberately **without**
`allow-same-origin`. That combination gives the frame a null origin: the user's
HTML renders with its own styling and scripts, but cannot reach the parent
document, the visitor's Pustak session cookie, or any same-origin API. Granting
both `allow-scripts` and `allow-same-origin` would defeat the sandbox entirely
and must not be done.

The embedded render must suppress the Pustak corner mark, or every profile shows
two of them. A private `?pustak-embed=1` marker on the iframe `src` tells
`servePage` to skip `injectBranding`. It is a rendering hint only and grants no
access — a stranger appending it to any URL changes nothing but the badge.

### 4. No-index is a header, not a meta tag

Unlisted and private responses carry `X-Robots-Tag: noindex, nofollow`. A header
covers non-HTML objects too and does not require rewriting user HTML. A
site-wide `/robots.txt` route backs it up. This is a requirement, not a nicety:
the CoS acceptance test and the 2025-2026 incidents behind it both turn on
unlisted actually being unindexed rather than merely unguessable.

### 5. Known external risk — the LinkedIn preview may not be ours to fix

Memory `LinkedIn public face swapped 2026-09-05` records that LinkedIn's
preview fetcher returned "We couldn't generate a preview for this link" for four
separate URLs, including `prashamhtrivedi.in` pages that already carry complete
and correct `og:title`, `og:description`, `og:url` and Twitter tags and return
200 to a LinkedIn user agent from outside. The metadata was not the problem.

So acceptance criterion 3 (LinkedIn preview works) may fail for reasons no code
in this repository can fix — a Cloudflare bot-fight or WAF rule refusing
LinkedInBot at the edge. The plan therefore separates *emitting correct
metadata*, which is in scope and verifiable here, from *LinkedIn rendering the
preview*, which is a zone-configuration check listed in Validation. Do not let
spec 5 be judged failed on the second when the first is correct.

## Backend changes required

New files:

- `src/visibility.ts` — the three-state type, reading it from `customMetadata`
  with absence meaning unlisted, the metadata-preserving rewrite helper, and the
  `X-Robots-Tag` rule per state.
- `src/profile.ts` — the profile page renderer.
- `src/landing.ts` — the signed-out landing page renderer.
- `src/meta.ts` — Open Graph and Twitter tag generation, plus injection into
  user HTML that declares none of its own.
- `src/notfound.ts` — the branded 404 body, identical for private and missing.

Changed files:

- `src/pages.ts` — visibility enforcement in `servePage`; the branded 404 that
  no longer echoes the requested key; a `/<username>` profile route ahead of the
  catch-all; `PATCH /<slug>/<path>` to change visibility; `visibility` on every
  `/_list` row; accepting a visibility on upload; `/robots.txt` and the OG image
  route; `/` serving the landing to anonymous visitors instead of redirecting.
- `src/mcp.ts` — `visibility` argument on `write_page`, a new `set_visibility`
  tool, visibility reported by `list_pages` and the `pustak://pages` resource.
- `src/branding.ts` — honour the embed marker; leave everything else alone.
- `src/users.ts` — resolve a slug to a user for the profile route; keep the
  reserved list in step with the new routes.
- `src/ui.ts` — per-page visibility control in the dashboard, and the OpenAPI
  spec updated to stop advertising that all reads are public.
- `README.md` — same correction.

No migration file. No `wrangler.jsonc` change. No new dependency.

## Frontend changes required

Everything is server-rendered HTML in the existing Indic-pothi palette, which is
defined inline at the top of `src/ui.ts` and should be lifted into a shared
constant rather than copied three times.

- **Dashboard** (`src/ui.ts`): each row in the index gains a three-way
  visibility control showing the current state. Switching a page to public
  raises a plain-language confirmation naming all three consequences — anyone
  can open it, it appears on your profile, search engines may index it. The
  index makes public pages visually obvious at a glance.
- **Profile** (`src/profile.ts`): name and slug, the sandboxed about frame, and
  the list of public pages. Signed out, it carries a sign-in call to action.
  Signed in as the owner, it additionally shows unlisted and private pages with
  unmistakable markers, so the owner can see the difference between their view
  and a stranger's.
- **Landing** (`src/landing.ts`): the problem sentence, three beats, the callout
  to `/prash-h-trivedi` as live proof, then sign-in as the second step. None of
  the three CoS prohibitions: no hire-me call to action, no promising something
  a stranger cannot then see, no link that previews as broken.
- **404** (`src/notfound.ts`): branded, one line saying what Pustak is, a
  create-account link, and no information about what was requested.

## Acceptance Criteria

Carried from `requirements.md`, which remains the contract.

1. With no account and no session, a visitor to `/` sees proof of what Pustak
   does within ten seconds.
2. Sign-in is visibly the second step on the landing, never the first.
3. The landing and profile both emit complete, correct Open Graph and Twitter
   metadata in the delivered HTML, without requiring a crawler to run scripts.
   (LinkedIn actually rendering it is verified separately — see the risk note.)
4. Every URL that worked before this ships still works after it, including
   `/<username>/` and `/<username>/index.html`.
5. A private page returns a response byte-identical to one for a page that never
   existed, and the response body reveals nothing about the requested path.
6. An unlisted page opens by link and appears on no profile.
7. A public page appears on its owner's profile and nowhere else without the
   owner's action.
8. A page created without a stated visibility is unlisted — identically through
   the dashboard, a direct request, and MCP.
9. A signed-in owner viewing their own profile can tell at a glance which of
   their pages a stranger would see.
10. Unlisted and private responses carry `X-Robots-Tag: noindex, nofollow`, and
    `/robots.txt` is served.
11. Changing a page's visibility preserves its content type and owner metadata.

## Validation

There is no test framework in this project. Validation is a typecheck plus a
scripted pass against a local `wrangler dev`, and the signed-out criteria must
be checked from a session with no cookie jar — a second terminal or a private
window, not the dev browser you logged in with.

### Static

```bash
npm run typecheck        # tsc --noEmit — must be clean
npx wrangler deploy --dry-run
```

### Local flows

```bash
npm run dev              # http://localhost:8787
BASE=http://localhost:8787
```

Sign in once in a browser at `$BASE/_login` and export the session cookie as
`$C` for the authenticated calls below.

**Visibility, the core loop.** For each of the three states, set it and check
both views:

```bash
# write a page (no visibility stated -> must become unlisted)
curl -X PUT "$BASE/$USER/probe.html" -H "cookie: $C" \
     -H 'content-type: text/html' --data '<h1>probe</h1>'
curl -s "$BASE/_list" -H "cookie: $C" | grep probe     # expect visibility: unlisted

# anonymous read of an unlisted page: 200, and noindex header present
curl -si "$BASE/$USER/probe.html" | head -20

# go private, then read anonymously
curl -X PATCH "$BASE/$USER/probe.html" -H "cookie: $C" \
     -H 'content-type: application/json' --data '{"visibility":"private"}'
curl -si "$BASE/$USER/probe.html"                      # expect 404
curl -si "$BASE/$USER/definitely-never-existed.html"   # expect an IDENTICAL 404
```

The last two responses must match in status, headers and body. Diff them; do not
eyeball them. This is acceptance criterion 5 and it is the one most likely to
regress quietly.

**Metadata preservation** — criterion 11, the likeliest bug:

```bash
curl -X PUT "$BASE/$USER/style.css" -H "cookie: $C" \
     -H 'content-type: text/css' --data 'body{color:red}'
curl -X PATCH "$BASE/$USER/style.css" -H "cookie: $C" \
     -H 'content-type: application/json' --data '{"visibility":"public"}'
curl -sI "$BASE/$USER/style.css" | grep -i content-type   # must still be text/css
```

**Profile.** Anonymous `GET $BASE/$USER` lists public pages only, shows the
sandboxed about frame if `index.html` is public, and carries a sign-in call to
action. The same URL with the owner's cookie additionally shows unlisted and
private pages, marked. Confirm `$BASE/$USER/` and `$BASE/$USER/index.html` both
still serve the page directly.

**Landing.** Anonymous `GET $BASE/` returns the landing, not a redirect to
`/_login`. With the owner's cookie, the same URL still returns the dashboard.

**Social metadata.** Fetch the landing and a profile and confirm the tags are in
the delivered bytes:

```bash
curl -s "$BASE/" | grep -o 'og:[a-z]*' | sort -u
curl -s "$BASE/$USER" | grep -o 'og:[a-z]*' | sort -u
```

**LinkedIn, after deploy, as a separate step.** Fetch the deployed URL with
LinkedIn's user agent from outside Cloudflare and confirm a 200 with the tags
intact:

```bash
curl -sI -A 'LinkedInBot/1.0 (compatible; Mozilla/5.0)' \
  https://pustak.prashamhtrivedi.app/
```

If that returns 200 with correct tags but LinkedIn's own post composer still
refuses to preview, the fault is at the zone, not in this code: check
bot-fight mode and WAF rules for LinkedInBot on the `prashamhtrivedi.app` zone
before touching anything here. Prior evidence points that way.

**MCP.** Reconnect a client and confirm `write_page` accepts a visibility,
defaults to unlisted without one, that `set_visibility` changes it, and that
`list_pages` reports it. Ownership checks must be unchanged — a client still
cannot touch another user's space.

### Specs

Broken down in `taskNotes/public-presence/specs/specs.md`, seven items with
their own findings files. Build order: spec 1 first (everything depends on the
storage contract), then 2, 3 and 6 in any order, then 4 and 5, then 7 last so
the documentation describes what actually shipped.
