# Purpose

Establish the storage contract for page visibility and enforce it on the serving
path, so that private means private and unlisted means genuinely unindexed.

## Original Ask

Spec 1 of `taskNotes/public-presence/taskFindings.md`. Contract:
`taskNotes/public-presence/requirements.md`, sections 1 and 5.

## Complexity and the reason behind it

**3 / 5.** The logic is small, but it sits on the hottest path in the product
and one of its acceptance criteria is an exact-match comparison between two
responses. Getting it subtly wrong is easy and quiet.

## Architectural changes required

New `src/visibility.ts`:

- `type Visibility = 'public' | 'unlisted' | 'private'`.
- `readVisibility(customMetadata)` — returns the stored value, and **`unlisted`
  when the key is absent or unrecognised**. This is what migrates every existing
  object with no script; do not add a backfill.
- `robotsHeaderFor(v)` — `noindex, nofollow` for unlisted and private, nothing
  for public.

## Backend changes required

`src/pages.ts`, in `servePage`:

- After fetching the object, read its visibility.
- `private` and the requester is not the owner → the branded 404 (below).
  Ownership is the existing session-plus-slug check; comparing the first key
  segment to the signed-in user's slug is sufficient and avoids a D1 round trip
  on anonymous requests, which never own anything.
- `unlisted` or `private` → set `X-Robots-Tag: noindex, nofollow` on the
  response.
- Public → unchanged behaviour.

New `src/notfound.ts`: a branded 404 body in the existing palette, one line
saying what Pustak is, and a create-account link. **It must not contain the
requested path, the key, or anything derived from them.** Replace the current
`c.text('Not found: ' + key, 404)`, which leaks the key today.

Add a `/robots.txt` route disallowing the reserved underscore paths and stating
the sitemap position; it backs up the header rather than replacing it.

## Frontend changes required

The 404 page only. Reuse the palette from `src/ui.ts` — lift the `:root` custom
properties into a shared exported constant rather than pasting a third copy.

## Acceptance Criteria

1. An object with no `visibility` metadata behaves exactly as unlisted.
2. An anonymous request for a private page returns a response byte-identical to
   one for a path that was never written.
3. The owner, signed in, still sees their own private page render normally.
4. Unlisted and private responses carry `X-Robots-Tag: noindex, nofollow`;
   public ones do not.
5. `/robots.txt` is served.
6. No 404 body anywhere contains the requested path.

## Validation

```bash
npm run typecheck
npm run dev
BASE=http://localhost:8787
curl -s "$BASE/$USER/private-page.html"        > /tmp/a
curl -s "$BASE/$USER/never-written-at-all.html" > /tmp/b
diff /tmp/a /tmp/b && echo "identical — criterion 2 holds"
curl -sI "$BASE/$USER/unlisted.html" | grep -i x-robots-tag
curl -sI "$BASE/$USER/public.html"   | grep -i x-robots-tag   # expect nothing
curl -s  "$BASE/robots.txt"
```

Diff the two 404s. Do not eyeball them — a differing `content-length` or an
echoed path defeats the whole point and is invisible at a glance.
