# Requirements — Public presence: profiles, visibility, and the proof door

**Status:** finalized requirements, ready for planning
**Date:** 2026-09-05
**Task name:** `public-presence`

---

## Why these are one piece of work

Two requests arrived separately and turn out to be the same decision seen from
two ends.

The first is a go-to-market problem, captured in the CoS options brief: a
stranger who follows a "run one" link from GitHub, LinkedIn, or the README hits
a login wall instead of proof. The second is a product gap: users want profile
pages and a public/private toggle.

Both are answers to one question — **what can a stranger see?** A profile page
is meaningless without a rule for which pages appear on it, and the landing's
proof is only credible if it points at something a signed-out person can
actually open. Building either alone forces the other's design decisions to be
made badly and in a hurry. They ship together.

---

## What is true today

- Every page that has ever been stored is openable by anyone who has the URL.
  There is no private option and never has been.
- No page is listed anywhere public. The only listing is the owner's own
  signed-in dashboard.
- The homepage sends signed-out visitors straight to login.
- A bare `/<username>` currently just tries to serve that user's `index.html`.

In the vocabulary this document introduces, **every existing page is already
"unlisted."** Nothing about this work needs to change that, and nothing about
it should break a link anyone has already shared.

---

## Scope

**In scope**

1. A three-state visibility setting on every page.
2. A profile page for every user with a slug.
3. A landing page for signed-out visitors.
4. Sign-in prompts placed where they can actually convert someone.
5. Correct search-engine and social-preview behaviour for each state.
6. Setting and changing visibility from both the dashboard and an agent.

**Out of scope this round**

- A profile-level on/off switch. Visibility lives entirely on pages; a user with
  no public pages simply has a bare profile.
- Editable bio, avatar, or link fields on the profile. The user's own uploaded
  page fills that role.
- Sharing a private page with named individuals, passwords, or expiring links.
- A public directory or feed of pages across all users.
- Agents reading other people's pages.
- Custom domains.

---

## 1. The visibility model

Every page has exactly one of three states.

| State | Can a stranger open the URL? | Does it appear on the profile? | Search engines |
| --- | --- | --- | --- |
| **Public** | Yes | Yes | Indexable |
| **Unlisted** | Yes | No | Actively blocked |
| **Private** | No — owner only | No | Actively blocked |

Rules:

- The state is per page, set by its owner, and changeable at any time with
  immediate effect.
- **The word shown to users is "Unlisted," never "secret" or "private."** Its
  help text must say plainly that anyone with the link can open it and that it
  is not protected. This is a hard requirement, not a copy preference — the
  best-known failure in this product category is a link-only state named
  "secret," which led people to put credentials behind it.
- "Blocked from search engines" means an explicit instruction not to index,
  served both on the page and site-wide. Obscurity does not count. Several
  well-publicised 2025-2026 incidents came from assuming an unguessable URL was
  the same as an unindexed one.

### Default for new pages

- A page created without a stated visibility is **unlisted**. The link works
  immediately, so writing a page and handing over its URL stays a single step,
  but nothing reaches the profile without a deliberate act.
- Anything that creates pages may state a visibility explicitly and have it
  honoured.
- **The default must be identical however a page is created** — dashboard,
  direct request, or agent. A safe default in one surface and a permissive one
  in another is a known and repeated cause of leaked user content, so the two
  are specified and reviewed as one rule.

### Existing pages

- Every page that exists at the time this ships becomes **unlisted**.
- No existing link changes behaviour. Nothing is retracted, nothing 404s that
  did not before.
- Users promote pages to public deliberately. Nothing is promoted for them,
  because content written when "public by URL" was the only option was not
  consented to as "listed on a public profile."

### What a stranger gets on a private page

A plain not-found response, identical in every respect to the response for a
page that was never written. A stranger cannot learn that a private page
exists.

There is deliberately **no sign-in prompt on a private page.** Signing in would
not grant access, so the prompt would be a wall in front of a door with no key
— the exact pattern the CoS brief forbids. A private page also has an audience
of one by definition, so there is no reader there to convert.

The growth opportunity moves onto the not-found page itself: it is
Pustak-branded, says in one line what Pustak is, and offers account creation.
Because it is byte-identical for private and never-existed pages, it reveals
nothing.

The owner, signed in, sees their own private page render normally.

---

## 2. Profile pages

### Address

- A user's profile is served at `/<username>`. **The profile always wins at
  that address** — it is not conditional on what the user has uploaded.
- The user's pages continue to live one level below, at
  `/<username>/<path>`, and every one of those URLs behaves exactly as it does
  today.
- This is the same collision rule every comparable product converged on:
  the profile gets its own address and user content is namespaced beneath it.
  No arbitrary user page competes for the bare slug.

### What is on it

In order, top to bottom:

1. The user's identity — display name and slug.
2. An **about section**, described below.
3. A list of that user's **public** pages, each with a title and a link.
4. When the visitor is signed out, a sign-in / create-account call to action.

A user with no public pages still has a profile. It shows their name and
nothing else. That is the intended way to have no public presence.

### The about section

- If the user has uploaded a page at `index.html` in their space, that page
  becomes the about section. `index.html` takes precedence; a page named
  `about.html` has no special meaning and is an ordinary page.
- The user's page is **rendered inline, in isolation** — it appears as designed,
  with its own styling, but it cannot alter or break the surrounding profile,
  and it cannot reach the visitor's Pustak session.
- The page remains directly reachable at its own URL. Feeding the about section
  does not remove or move it.
- If the user's `index.html` is not public, it does not appear on the profile —
  the about section follows the same visibility rules as everything else.
- With no usable `index.html`, the about section is simply absent.

### Owner's view

When signed in and viewing their own profile, the owner additionally sees their
unlisted and private pages, each clearly marked, so the profile doubles as a
preview of what strangers see. The distinction between "what I see" and "what
they see" must be unmistakable.

---

## 3. The landing page

- A signed-out visitor to `/` gets a landing page. A signed-in visitor to `/`
  still gets their dashboard, unchanged.
- The landing carries, in order: one sentence naming the problem Pustak solves;
  three short beats — it stores your pages, serves them, and an agent can write
  them; a prominent callout linking to the owner's profile at
  `/prash-h-trivedi` as live proof; and sign-in / create-account as the second
  step, not the first.
- The proof link goes to a real profile with real pages on it. No screenshots
  standing in for the product.

### Prohibited on the landing

Carried directly from the CoS brief:

- No hire-me call to action of any kind.
- No promising a stranger they can see something and then requiring login.
- No links published anywhere that lack a working social preview.

---

## 4. Where sign-in is offered

Three surfaces, each with a real audience:

1. The landing, as step two after the proof.
2. Signed-out profile pages.
3. The existing Pustak mark on every served page, which already invites sign-in.

And one deliberate absence: private pages, for the reason given above.

---

## 5. Search engines and social previews

- Public pages and profiles are indexable.
- Unlisted and private pages carry an active instruction not to index, both
  on the page and in the site-wide crawler rules.
- The landing and every profile produce a correct link preview — title,
  description, and image — on LinkedIn and X.
- A user page that already declares its own preview information keeps it
  untouched. A user page that declares none gets a reasonable Pustak-generated
  preview so shared links never render as broken.
- Preview information must be present in the page as delivered, without
  requiring a crawler to run scripts.

---

## 6. Setting visibility

**From the dashboard.** Each page in the owner's list shows its current state
and can be changed to any of the three in one action. The list makes it
obvious at a glance which pages are public. Changing a page to public is a
deliberate act with a plain-language confirmation of what it means: anyone can
open it, it will appear on your profile, and search engines may index it.

**From an agent.** An agent acting for the user can state a visibility when
writing a page, change an existing page's visibility, and see the current
visibility of every page it lists. An agent may only do this within its own
user's space, exactly as today. Where visibility is not stated, unlisted
applies.

---

## 7. Acceptance

The stranger test, from the CoS brief, is the primary gate:

1. With no account and no session, a visitor lands on `/` and sees proof of
   what Pustak does within ten seconds.
2. Sign-in is visibly the second step, never the first.
3. The landing and profile links both render a correct preview when pasted into
   LinkedIn.

And for the visibility model:

4. Every URL that worked before this ships still works after it.
5. A page set to private returns a response indistinguishable from a page that
   never existed.
6. A page set to unlisted opens by link and appears on no profile.
7. A page set to public appears on its owner's profile and nowhere else
   without the owner's action.
8. A page created without a stated visibility is unlisted, whether it was
   created through the dashboard or by an agent.
9. A signed-in owner viewing their own profile can tell at a glance which of
   their pages a stranger would see.

---

## Decisions, and why

| Decision | Reasoning |
| --- | --- |
| Three states, not two | Today's behaviour *is* unlisted. A binary would force every existing page to become either listed or unreachable, and there would be no way to share a link quietly. Mature products in this category converged on three; the ones that shipped two are the ones with public regrets. |
| Unlisted is the default | Keeps writing-then-sharing a single step, which is most of the product's appeal, while making public presence something a user chooses rather than something that happens to them. |
| Same default everywhere | Permissive programmatic defaults sitting behind safe interface defaults is a repeated and well-documented cause of leaked user content. |
| Profile always owns `/<username>` | Every comparable product designs this collision away rather than resolving it conditionally. A conditional rule would make a person's profile URL mean different things for different people and break as soon as they upload a file. |
| `index.html` feeds the about section | It is what users already have, so the feature works for existing accounts on day one without anyone renaming anything. |
| Rendered inline and isolated | It is a page store — letting your own HTML be your introduction is the product's whole character. Isolation is what makes that safe to allow. |
| Private returns not-found | Whether a draft exists is itself private. A sign-in prompt would confirm existence and promise access it cannot deliver. |
| No profile-level switch yet | Per-page visibility already expresses everything a profile switch would, and a master switch that silently overrides per-page choices would break links users had deliberately shared. |
