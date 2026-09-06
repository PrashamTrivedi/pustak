# Purpose

Give a signed-in user a one-click path from the app to their own profile, and a
way back.

## Original Ask

Task 1 of `taskNotes/profile-polish/taskFindings.md`:

> I need to see my profile from the app itself and navigate to it.

## Complexity and the reason behind it

**1 / 5.** Two anchor tags in server-rendered strings. The username is already in
scope at both edit sites, so no function signature changes and no new data is
fetched. Nothing about visibility or access changes.

## Architectural changes required

None.

## Backend changes required

None. `dashboardHtml(username, email)` at `src/ui.ts:9` already receives the
slug, and `ProfileModel` already carries `isOwner` and `user.username`.

## Frontend changes required

**`src/ui.ts` — the outbound link.** The "Signed in" card at `src/ui.ts:261`
renders `@${esc(username)}` alongside the email and the sign-out form. Add a
profile link in that bar. It is the right home for it: the card is already the
"this is who you are" region, it sits above the fold, and it is the only place in
the dashboard where the slug is presented as identity rather than as a path
prefix.

The href is `/${esc(username)}`. Slugs are validated to `[a-z0-9-]` by
`isValidSlug` (`src/users.ts:17`), so percent-encoding is a no-op here, but keep
`esc()` for the HTML-attribute context regardless — the cost is nothing and it
survives any future loosening of the slug rule.

Optionally mirror it in the colophon row at `src/ui.ts:248`, which already
carries the `/_docs` link and is the established spot for secondary navigation.

**`src/profile.ts` — the return link.** When `isOwner` is true, render a link
back to `/_browse`. Without it the profile is a one-way trip from the dashboard,
which is a worse experience than having no link at all. Place it with the footer
actions rather than the header, so it does not compete with the identity block.

Strangers must not see it: `/_browse` redirects anonymous visitors to `/_login`
(`src/pages.ts:250`), so an always-rendered link would be a dead end that also
advertises internal routes. Gate it on `isOwner`, not `effectiveOwner` — see
spec 2 for why the owner keeps their chrome inside the preview.

## Acceptance Criteria

The criterion is complete satisfaction of the Original Ask: a signed-in user
reaches their own profile from within the app without typing a URL, and can get
back to `/_browse` from there. Concretely:

1. `/_browse` and `/` (signed in) both show a link to `/<username>`.
2. The link points at the viewer's own slug, not a hardcoded or stale value.
3. The profile shows a link back to `/_browse` when the viewer owns it.
4. An anonymous visitor to a public profile sees no link to `/_browse`.
5. `npm run typecheck` is clean.

## Validation

    npm run typecheck
    npx tsx --test src/*.test.ts

Then `npx wrangler dev`, signed in:

1. Load `/_browse`, confirm the profile link is visible in the signed-in card and
   that its href matches your slug.
2. Click it; confirm it lands on `/<username>` and renders the owner view.
3. Click the return link; confirm it lands back on `/_browse`.
4. Sign out, load `/<username>` — confirm no `/_browse` link appears. Grep the
   response to be sure rather than trusting the eye:

       curl -s http://localhost:8787/<user> | grep -c '_browse'

   Expect `0`.
