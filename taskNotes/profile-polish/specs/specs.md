# Specs — profile polish

Three specs, in dependency order. Spec 1 is independent and can ship alone.
Spec 3 depends on spec 2's model change, because the collapsed section and the
public/hidden counts both key off `effectiveOwner`, which spec 2 introduces.
Doing 3 before 2 would mean writing the layout against `isOwner` and then
rewriting every branch of it.

| # | Spec | Files | Depends on | Ships alone? |
|---|------|-------|-----------|--------------|
| 1 | Reach the profile from the app | `src/ui.ts`, `src/profile.ts` | — | yes |
| 2 | Owner view vs public preview | `src/profile.ts`, `src/pages.ts` | — | yes |
| 3 | Public called out, rest collapsed | `src/profile.ts` | spec 2 | no |

Suggested order: 1, 2, 3. Spec 1 is the smallest and immediately answers the
original complaint that there is no way in; spec 2 carries the safety-critical
model change and should get its unit tests before spec 3 starts rearranging the
markup on top of it.

## Shared invariants

These hold across all three specs and are the things a reviewer should check
first:

- The public preview reuses the stranger's code path with `effectiveOwner`
  forced false. It is never a second renderer.
- A stranger's HTML contains no unlisted or private path and no count of them.
- The about frame keeps `sandbox="allow-scripts"` and never gains
  `allow-same-origin`.
- `/<username>/` and `/<username>/index.html` behaviour is untouched.
- Server-rendered strings only; the accordion is native `<details>`.
