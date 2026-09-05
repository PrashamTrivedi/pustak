# Purpose

Stop the README and the OpenAPI spec from describing a contract that no longer
holds.

## Original Ask

Spec 7 of `taskNotes/public-presence/taskFindings.md`.

## Complexity and the reason behind it

**1 / 5.** Documentation only. It is last in the build order on purpose, so it
describes what actually shipped rather than what was planned.

## Architectural changes required

None.

## Backend changes required

None, beyond the spec document that `src/ui.ts` generates.

## Frontend changes required

`README.md` currently states flatly that reads are public — in the prose, in the
API table, and in the worked example. All three need correcting to the
three-state model, plus new rows for `PATCH`, the profile URL, the landing, and
the two new MCP capabilities.

`openApiSpec()` in `src/ui.ts` needs the same treatment: the `PATCH` operation,
`visibility` on `/_list` rows and on upload, and corrected descriptions wherever
it says a read needs no authentication.

## Acceptance Criteria

1. No statement anywhere in README or the OpenAPI spec claims all reads are
   public.
2. The three states are described, with the link-only one named **Unlisted** and
   its help text saying anyone holding the link can open it.
3. `PATCH`, the profile URL and the landing appear in the documented surface.
4. `set_visibility` appears in the MCP tool list.
5. The Swagger page loads and its "try it out" calls still work against a live
   session.

## Validation

```bash
npm run typecheck
curl -s "$BASE/_openapi.json" | python3 -m json.tool > /dev/null && echo "valid JSON"
grep -rniE 'reads are public|no auth' README.md src/ui.ts   # expect nothing stale
```

Open `$BASE/_docs` and confirm Swagger renders, the PATCH operation is listed,
and a "try it out" call still rides the browser session.
