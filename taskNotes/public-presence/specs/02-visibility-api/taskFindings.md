# Purpose

Let a user see and change any page's visibility, from the API and from the
dashboard, without ever losing the page's content type or ownership.

## Original Ask

Spec 2 of `taskNotes/public-presence/taskFindings.md`. Contract:
`taskNotes/public-presence/requirements.md`, section 6.

## Complexity and the reason behind it

**3 / 5.** The endpoint is routine. The read-modify-write against R2 is where
this goes wrong, and the dashboard control has a real interaction-design
requirement attached to it rather than being a plain toggle.

## Architectural changes required

R2 has no metadata-only update, so changing visibility means reading the object
and writing it back. `src/visibility.ts` owns that helper, and it must carry
across **both** the existing `httpMetadata.contentType` and the existing
`customMetadata.owner`. Dropping either corrupts the object silently — a CSS
file that comes back as `text/html` will render as text in the browser and
nobody will notice until a page looks wrong.

## Backend changes required

- `PATCH /<slug>/<path>` in `src/pages.ts`, reusing the existing `requireSlug`
  ownership check and the reserved-path guard. Body `{"visibility": "..."}`.
  Reject an unrecognised value with 400. 404 if the object does not exist.
- Upload (`PUT`/`POST`) accepts an optional visibility, via a header or a query
  parameter, and stores unlisted when it is absent.
- `/_list` returns `visibility` on every row.

## Frontend changes required

In `src/ui.ts`, each row of the index gains a three-way visibility control
showing its current state, wired to the PATCH endpoint and reloading the list on
success.

Public pages must be obvious at a glance in the list — a state chip in the row,
not a control the eye has to read.

Switching a page **to public** raises a confirmation naming all three
consequences in plain language: anyone can open it, it will appear on your
profile, and search engines may index it. Switching in any other direction needs
no confirmation. The word in the interface is **Unlisted**, with help text saying
plainly that anyone holding the link can open it and that it is not protected.

## Acceptance Criteria

1. PATCH changes visibility and the change takes effect on the next request.
2. Content type and owner survive the change.
3. PATCH on someone else's page is refused, exactly as PUT and DELETE are.
4. An upload with no stated visibility becomes unlisted.
5. `/_list` reports visibility for every page.
6. The dashboard shows current state per page, makes public pages obvious, and
   confirms before publishing.

## Validation

```bash
npm run typecheck
# metadata preservation — the likeliest bug
curl -X PUT   "$BASE/$USER/t.css" -H "cookie: $C" -H 'content-type: text/css' --data 'body{}'
curl -X PATCH "$BASE/$USER/t.css" -H "cookie: $C" -H 'content-type: application/json' \
     --data '{"visibility":"public"}'
curl -sI "$BASE/$USER/t.css" | grep -i content-type    # must still be text/css
# cross-user refusal
curl -X PATCH "$BASE/someone-else/x.html" -H "cookie: $C" \
     -H 'content-type: application/json' --data '{"visibility":"public"}'   # expect 403
# bad input
curl -X PATCH "$BASE/$USER/t.css" -H "cookie: $C" \
     -H 'content-type: application/json' --data '{"visibility":"banana"}'   # expect 400
```

In the browser: confirm the publish confirmation appears, that cancelling it
leaves the state unchanged, and that the list reloads after a successful change.
