# Purpose

Let an agent set and change a page's visibility, and see it when listing, without
weakening the ownership boundary.

## Original Ask

Spec 6 of `taskNotes/public-presence/taskFindings.md`. Contract:
`taskNotes/public-presence/requirements.md`, section 6.

## Complexity and the reason behind it

**2 / 5.** Additive changes to an existing tool surface with a settled storage
contract. It carries a compatibility consideration — external clients have
already registered against these schemas — which is why every change here is
additive and optional.

## Architectural changes required

None. `src/mcp.ts` reuses the helpers from `src/visibility.ts`.

The default must match every other surface: a `write_page` call that states no
visibility produces an unlisted page. A safe default in the dashboard sitting
beside a permissive one in the tool API is the specific failure this requirement
was written to prevent, so the two read from one shared constant rather than
each declaring their own.

## Backend changes required

In `src/mcp.ts`:

- `write_page` gains an optional `visibility` argument. Absent means unlisted.
  Its description states that plainly, and calls the link-only state
  **unlisted** — never "secret", never "private".
- New `set_visibility` tool taking a slug-relative path and a visibility,
  reusing the metadata-preserving rewrite from spec 2 so content type and owner
  survive.
- `list_pages` reports each page's visibility.
- The `pustak://pages` resource does the same.
- `pustak://about` stops saying reads are public, since that is no longer true.

Ownership is unchanged: every tool stays scoped to the caller's own slug, and
`set_visibility` gets the same guard as `delete_page`.

## Frontend changes required

None. The dashboard's MCP card in `src/ui.ts` lists the available tools, so add
`set_visibility` to that line.

## Acceptance Criteria

1. `write_page` with no visibility produces an unlisted page.
2. `write_page` with a stated visibility honours it.
3. `set_visibility` changes an existing page and preserves its content type and
   owner.
4. `list_pages` and `pustak://pages` report visibility.
5. Every tool remains scoped to the caller's own slug.
6. Existing clients that call `write_page` without the new argument keep working
   unchanged.

## Validation

Reconnect an MCP client against the dev Worker and exercise each tool. Confirm
via `/_list` that a `write_page` with no visibility landed as unlisted, that
`set_visibility` moved it, and that a `.css` page keeps its content type across
the change. Confirm a call naming another user's path is refused exactly as
`delete_page` refuses one today.

```bash
npm run typecheck
```
