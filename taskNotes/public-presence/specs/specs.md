# Specs — public presence

Seven independently shippable units. The contract is
`taskNotes/public-presence/requirements.md`; the architecture is
`taskNotes/public-presence/taskFindings.md`. Read both before starting any spec.

## Build order

```
1. visibility-core     (storage contract — everything else depends on it)
        |
        +-- 2. visibility-api      (PATCH, _list, upload argument)
        +-- 3. profile-pages       (/<username>)
        +-- 6. mcp-visibility      (tools)
                |
                +-- 4. landing-page      (needs a profile to point at)
                +-- 5. social-preview     (needs landing + profile to tag)
                        |
                        +-- 7. docs-sync   (last, so docs describe what shipped)
```

Specs 2, 3 and 6 may be built in parallel once 1 lands. Spec 4 needs 3 because
its proof callout links to a real profile. Spec 5 needs both 3 and 4 because it
tags them. Spec 7 goes last on purpose.

## The list

| # | Spec | What it delivers | Criteria it satisfies |
| --- | --- | --- | --- |
| 1 | `01-visibility-core` | Visibility in R2 metadata, serving enforcement, branded 404, no-index headers, robots.txt | 5, 6, 8, 10 |
| 2 | `02-visibility-api` | PATCH to change visibility, visibility on `/_list`, visibility accepted on upload, dashboard control | 8, 9, 11 |
| 3 | `03-profile-pages` | `/<username>` profile, sandboxed about frame, owner-versus-stranger view | 4, 7, 9 |
| 4 | `04-landing-page` | Signed-out landing at `/`, proof callout, sign-in second | 1, 2 |
| 5 | `05-social-preview` | OG and Twitter tags, static preview image, injection into untagged user pages, LinkedIn edge check | 3 |
| 6 | `06-mcp-visibility` | `visibility` on `write_page`, `set_visibility` tool, visibility in listings | 8 |
| 7 | `07-docs-sync` | README and OpenAPI stop claiming all reads are public | — |

## Standing rules for every spec

- `npm run typecheck` must be clean before a spec is considered done.
- Signed-out behaviour is verified without a cookie jar — a second terminal or a
  private window, never the browser you logged in with.
- The user-facing word is **Unlisted**. Never "secret", never "private" for the
  link-only state.
- Never grant an iframe `allow-scripts` and `allow-same-origin` together.
- Do not echo a requested path back in a 404 body.
