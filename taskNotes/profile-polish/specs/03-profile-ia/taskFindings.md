# Purpose

Rearrange the profile so what is public is the first and loudest thing on the
page, and everything else is folded away until asked for.

## Original Ask

Task 3 of `taskNotes/profile-polish/taskFindings.md`:

> Arrange the info in better way... Call out public, and probably hide or bury
> others behind the accordion or collapsed section

## Complexity and the reason behind it

**2 / 5.** Markup and CSS inside one template function, with one native
`<details>` element and a counts strip. No new data is fetched — the counts come
from the listing `loadProfile` already walks. The score is not 1 because the
stranger's version of the layout has a disclosure rule attached to it that is
easy to get wrong (see below).

Depends on spec 2: the section gating keys off `effectiveOwner`, and building
this against `isOwner` first would mean rewriting each branch afterwards.

## Architectural changes required

None beyond spec 2's model split. The counts are added to `ProfileModel`, derived
from the same single `BUCKET.list` walk — no extra request.

## Backend changes required

`src/profile.ts` gains public / unlisted / private counts on the model, populated
**only when `effectiveOwner` is true**. Leaving them populated for strangers and
merely not rendering them is the kind of thing that survives one refactor and
leaks on the next; keep the data absent, not just unused.

## Frontend changes required

**Owner view**, top to bottom:

1. Identity — display name and `@slug`, as today (`src/profile.ts:131`).
2. The canonical public URL, presented as something to share, with a copy
   control.
3. A summary strip: the public count as the dominant figure, the unlisted and
   private counts subordinate to it. This replaces the current prose banner at
   `src/profile.ts:92`, which explains the model in a sentence the owner has
   already read once. A count answers "what am I exposing" faster than a
   paragraph does.
4. The public section — the about frame when `index.html` is public, then the
   public pages. Labelled unambiguously as what anyone can see. This is the
   visual centre of the page.
5. A collapsed `<details>` accordion, summary reading roughly "Only you can see
   these — N", holding unlisted and private pages with the existing per-state
   marks and the `.vis-unlisted` / `.vis-private` styles at
   `src/profile.ts:122`. Collapsed on load; the whole point is that the public
   face is what the owner looks at by default.
6. Footer actions — back to `/_browse` (spec 1) and the public preview toggle
   (spec 2).

**Stranger view:** identity, about frame if `index.html` is public, public pages,
existing sign-in call to action (`src/profile.ts:96`). Then stop.

The disclosure rule, stated plainly because it is the one thing in this spec that
can go wrong in a way nobody notices: **do not render the accordion shell, the
counts strip, or any "hidden" wording for a stranger.** A collapsed section
labelled "only you can see these" discloses that hidden pages exist even when it
lists none, and an empty accordion is arguably worse than a populated one because
it looks harmless. Render nothing.

The about frame keeps `sandbox="allow-scripts"` without `allow-same-origin`
(`src/profile.ts:87`) as it moves. That null origin is what prevents embedded
user HTML from reaching the visitor's session; relaxing it while repositioning
the element would be a silent security regression.

`<details>`/`<summary>` is native: keyboard-operable, screen-reader announced,
and functional with JavaScript disabled, which keeps the server-rendered
constraint intact. The codebase already uses the pattern at `src/ui.ts:271`, so
match that idiom rather than building a JS toggle.

Styling stays in the existing `<style>` block in `profileHtml` using the theme
tokens already imported from `src/theme.ts` — `--sindoor`, `--haldi`,
`--ink-soft`, `--rule`. No new stylesheet, no external assets.

## Acceptance Criteria

The criterion is complete satisfaction of the Original Ask. Concretely:

1. In the owner view, public pages are visually dominant and explicitly labelled
   as publicly visible.
2. Unlisted and private pages appear only inside a section that is collapsed on
   page load.
3. That section states how many items it holds without being expanded.
4. The collapsed section opens and closes with JavaScript disabled, and is
   reachable and operable by keyboard.
5. A stranger's HTML contains no accordion, no counts, and no wording implying
   hidden pages exist.
6. The owner sees the canonical public profile URL in a form they can copy.
7. The about frame retains `sandbox="allow-scripts"` and does not gain
   `allow-same-origin`.
8. Per-page visibility marks remain distinguishable between unlisted and private.
9. `npm run typecheck` is clean and the suite passes.

## Validation

    npm run typecheck
    npx tsx --test src/*.test.ts

**Local**, `npx wrangler dev`, signed in with at least one page of each state:

1. Load `/<user>`. The public group is above the fold and the hidden section is
   collapsed — confirm on first paint, not after scrolling.
2. Confirm the summary counts match the actual page states.
3. Expand the section; confirm unlisted and private are individually marked.
4. Tab to the summary and toggle it with the keyboard.
5. Disable JavaScript, reload, toggle again — it must still work.
6. Copy the public URL from the page and open it in a private window; confirm it
   lands on the public profile.

**The stranger check**, which is the one worth automating:

    curl -s http://localhost:8787/<user> > /tmp/anon.html
    grep -icE '<details|only you|unlisted|private' /tmp/anon.html

Expect `0`. Then confirm no stored path leaked by listing every href and checking
it against the known-public set.

**Live**, after deploy, repeat the anonymous grep against
`https://pustak.prashamhtrivedi.app/<user>` and confirm the public page count
rendered matches what `/_list` reports as public for that user.
