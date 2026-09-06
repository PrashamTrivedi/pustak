# Purpose

Give every user a profile at `/<username>` that shows who they are, their own
page as an introduction, and the pages they have chosen to make public.

## Original Ask

Spec 3 of `taskNotes/public-presence/taskFindings.md`. Contract:
`taskNotes/public-presence/requirements.md`, section 2.

## Complexity and the reason behind it

**4 / 5.** It changes the meaning of an existing URL shape without breaking the
URLs beneath it, it embeds arbitrary user HTML that must not be able to reach the
visitor's session, and it renders two different views of the same page depending
on who is looking.

## Architectural changes required

**Routing.** A single-segment path that matches a username in D1 renders the
profile. Register it ahead of the `/*` catch-all in `src/pages.ts`. The D1
lookup runs only for single-segment paths, so `/<user>/<page>` keeps its current
single-R2-call cost. Remove the bare-slug redirect for paths that resolve to a
real username; keep the existing behaviour for those that do not.

`/<username>/` and `/<username>/index.html` must keep serving the user's own page
directly, subject to its own visibility. This is acceptance criterion 4 of the
parent plan and it is non-negotiable — live links depend on it.

**The about frame.** Point an iframe at the user's `index.html` URL with
`sandbox="allow-scripts"` and **not** `allow-same-origin`. The null origin is
what stops the embedded page reaching the parent document or the visitor's
session cookie. Granting both defeats the sandbox; do not.

Suppress the Pustak corner mark inside the frame via a `?pustak-embed=1` marker
that `servePage` recognises and passes to `injectBranding`. It is a rendering
hint with no access implications.

If the user's `index.html` is missing or is not public, the about section is
simply absent from a stranger's view.

## Backend changes required

- `src/users.ts`: resolve a slug to a user record for the profile route.
- `src/profile.ts`: gather the user, their `index.html` if usable, and their page
  list via one `BUCKET.list({ include: ['customMetadata'] })` filtered by
  visibility — public only for strangers, everything for the signed-in owner.
- `src/pages.ts`: the route, and the embed marker in `servePage`.
- `src/branding.ts`: skip injection when the marker is set.

## Frontend changes required

`src/profile.ts` renders, top to bottom: display name and slug; the sandboxed
about frame when there is one; the list of pages with titles and links; and, for
a signed-out visitor, a sign-in and create-account call to action.

For the signed-in owner the list additionally carries their unlisted and private
pages with unmistakable state markers, so the page doubles as a preview of what a
stranger sees. The difference between the two views must be impossible to
misread — this is acceptance criterion 9 and a subtle marker fails it.

A user with no public pages still gets a profile showing their name and nothing
else. That is correct, not an error state.

## Acceptance Criteria

1. `/<username>` renders the profile for a real username.
2. `/<username>/` and `/<username>/index.html` behave exactly as before.
3. A stranger sees only public pages.
4. The owner sees all their pages with state markers, clearly distinguished.
5. The about frame renders the user's own page, and cannot reach the parent page
   or the session cookie.
6. No duplicated Pustak mark inside the frame.
7. A slug that matches no user behaves as it does today.
8. A profile with no public pages renders cleanly.

## Validation

```bash
npm run typecheck
curl -s  "$BASE/$USER"                 | grep -c 'sandbox="allow-scripts"'   # 1, and no allow-same-origin
curl -s  "$BASE/$USER" | grep -o 'allow-same-origin' && echo "FAIL: sandbox defeated"
curl -sI "$BASE/$USER/"                # unchanged
curl -sI "$BASE/$USER/index.html"      # unchanged
curl -sI "$BASE/not-a-real-username"   # same as today
```

Anonymous versus owner: fetch `$BASE/$USER` with and without the cookie and
confirm the page lists differ by exactly the non-public pages. In a browser,
confirm the embedded frame renders and that a script inside it cannot read
`document.cookie` from the parent.
