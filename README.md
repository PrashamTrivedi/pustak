# Pustak

A tiny Cloudflare Worker that stores standalone HTML pages in R2 and serves them.
Built with [Hono](https://hono.dev). Live at **https://pustak.prashamhtrivedi.app**.

The path *is* the storage key — `PUT /docs/intro` stores a page that's then served
at `GET /docs/intro`. No database, no build step for the pages themselves.

On top of the page store, Pustak now ships:

- **A remote MCP server** at `/mcp` (Streamable HTTP) exposing tools, resources
  and an `explainer` prompt — see [MCP server](#mcp-server).
- **OAuth 2.1 with passwordless email + OTP login** — MCP clients (e.g. Claude)
  authenticate via standard OAuth; users sign in with a one-time code emailed to
  them. See [Authentication](#authentication).
- **Pustak branding on shared pages** — every served HTML page carries an
  unobtrusive, dismissible mark inviting visitors to sign in / create an account,
  without getting in the way of reading.

Pre-existing pages are owned by `me@prashamhtrivedi.in` (the configured
`OWNER_EMAIL`); pages written through the MCP server are owned by the signed-in
account.

## API

Reads are public. Writes/deletes/listing require `Authorization: Bearer <API_TOKEN>`.

| Method   | Path        | Auth | Description                                              |
| -------- | ----------- | ---- | ------------------------------------------------------- |
| `GET`    | `/<path>`   | —    | Serve the stored page. `/` and `/foo/` → `index.html`.  |
| `PUT`    | `/<path>`   | ✅   | Create/replace a page. Body = page content.             |
| `POST`   | `/<path>`   | ✅   | Same as `PUT`.                                          |
| `DELETE` | `/<path>`   | ✅   | Delete a page. 404 if it doesn't exist.                 |
| `GET`    | `/_list`    | ✅   | List stored pages. Optional `?prefix=`. (reserved path) |

The Worker stores whatever `Content-Type` you send and replays it on `GET`
(defaults to `text/html; charset=utf-8`). **Send `-H "content-type: text/html"`
when uploading HTML** — otherwise the client default (e.g. curl's
`application/x-www-form-urlencoded`) is what gets stored and served back.

Paths beginning with `_` (`/_list`, `/_browse`, `/_docs`, `/_openapi.json`) are
reserved by the Worker and cannot be stored as pages (write/delete → 403).

## Admin pages

Public HTML, served by the Worker (the *operations* they perform still need the token):

- **`/`** — bucket browser when no `index.html` is stored. Paste the token to
  list, view, upload, and delete pages from the browser.
- **`/_browse`** — the bucket browser, always (even when an `index.html` exists at `/`).
- **`/_docs`** — Swagger UI for the API (temporary; backed by `/_openapi.json`).
  Click *Authorize* and paste the token to let an agent or human call endpoints.
- **`/_openapi.json`** — the OpenAPI 3.1 spec (server URL set to the request origin).

### Examples

```bash
BASE=https://pustak.prashamhtrivedi.app
TOKEN=...   # the API_TOKEN secret

# Upload an HTML file
curl -X PUT "$BASE/landing" \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: text/html" \
  --data-binary @page.html

# View it
curl "$BASE/landing"

# Update a nested page
curl -X PUT "$BASE/docs/intro" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: text/html" \
  --data-binary @intro.html

# List everything (or a subtree)
curl "$BASE/_list"            -H "Authorization: Bearer $TOKEN"
curl "$BASE/_list?prefix=docs/" -H "Authorization: Bearer $TOKEN"

# Delete
curl -X DELETE "$BASE/landing" -H "Authorization: Bearer $TOKEN"
```

## MCP server

`POST /mcp` is an OAuth-protected [MCP](https://modelcontextprotocol.io) server
(Streamable HTTP), implemented as a per-session Durable Object (`McpAgent`). The
signed-in account flows through to every handler, so writes are attributed to the
authenticated user.

- **Tools:** `whoami`, `list_pages`, `read_page`, `write_page`, `delete_page`
  (writes/deletes are ownership-checked).
- **Resources:** `pustak://about`, `pustak://pages` (JSON catalogue), and the
  template `pustak://page/{+path}` (a single page's content).
- **Prompt:** `explainer` — currently a placeholder; fill in
  `src/explainer.ts` (`EXPLAINER_PROMPT_TEXT`) and it's picked up automatically.

Point an MCP client at `https://pustak.prashamhtrivedi.app/mcp`. It will discover
the authorization server, register itself (Dynamic Client Registration), send you
through the email + OTP login, and connect — no manual client setup.

## Authentication

Auth is split across two libraries that each own one layer:

- **Identity — [Better Auth](https://better-auth.com)** on **D1**. Better Auth
  owns the `user` / `session` / `account` / `verification` tables and the
  passwordless **email-OTP** flow (its `emailOTP` plugin generates, stores and
  verifies the 6-digit code, with a built-in attempt limit; first sign-in
  auto-creates the account). It's called server-side (`auth.api.*`); its raw
  HTTP surface (`/api/auth/*`) is intentionally **not** mounted publicly.
- **OAuth protocol — `@cloudflare/workers-oauth-provider`** is the OAuth 2.1
  authorization server: it implements `/token`, `/register` and the
  `.well-known` discovery documents, and bearer-validates `/mcp`. Grants/tokens
  live in `OAUTH_KV`.

The two meet at the login UI (`src/auth.ts`): the `/authorize` page (and the
standalone `/_login`) collect email → OTP, call Better Auth's server API to
verify and sign in, then hand the resulting user identity to the OAuth
provider's `completeAuthorization()` — minting the grant whose `props` flow into
the MCP server. The OAuth access token, not the Better Auth session, is the
durable MCP credential.

OTP issuance (`/login/start`) is throttled per client IP and per email by two
Cloudflare `ratelimit` bindings (enforced on Cloudflare's network, no-ops in
local dev) to blunt email-bomb / cost abuse.

The legacy **`Authorization: Bearer <API_TOKEN>`** path still guards the REST
write/list API documented above. If `API_TOKEN` is unset, that REST API is
closed and the MCP server is the way in.

OTP email is delivered by our own **cfEmailSender** Worker
(`mail.prashamhtrivedi.app`) over a worker-to-worker **service binding**
(`EMAIL_SENDER`), authenticated with `EMAIL_API_KEY` (`x-api-key`) — no
third-party email provider. In local dev with no key set, the code is logged to
the console instead.

## Setup & deploy

```bash
npm install

# R2 bucket, the OAuth KV namespace, and the Better Auth D1 database.
# Paste the printed ids into wrangler.jsonc (OAUTH_KV.id / d1_databases[].database_id).
npx wrangler r2 bucket create pustak-pages
npx wrangler kv namespace create OAUTH_KV
npx wrangler d1 create pustak-auth

# Apply the Better Auth schema to D1
npx wrangler d1 migrations apply pustak-auth --remote

# Secrets
npx wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
npx wrangler secret put EMAIL_API_KEY        # cfEmailSender x-api-key for OTP email
npx wrangler secret put API_TOKEN            # optional: legacy REST write API

# Deploy (binds the custom domain pustak.prashamhtrivedi.app)
npm run deploy
```

The `EMAIL_SENDER` service binding targets the `cf-email-sender` Worker, which
must be deployed on the same Cloudflare account. `OWNER_EMAIL`,
`OTP_FROM_EMAIL` and `BETTER_AUTH_URL` are plain `vars` in `wrangler.jsonc`;
`OTP_FROM_EMAIL` must be a bare address on `prashamhtrivedi.app` (cfEmailSender
rejects display names and other domains). The custom domain route requires the
`prashamhtrivedi.app` zone to be active on the same account.

The Better Auth D1 schema (`migrations/0001_better_auth.sql`) is generated from
`scripts/auth-gen.ts` with `npx @better-auth/cli generate` — re-run it if the
plugin set changes.

## Local development

```bash
cp .dev.vars.example .dev.vars                 # set BETTER_AUTH_SECRET; API_TOKEN/EMAIL_API_KEY optional
npx wrangler d1 migrations apply pustak-auth --local
npm run dev                                     # R2 + KV + D1 + Durable Objects simulated locally
```

With `OTP_DEV_ECHO=1` and no `EMAIL_API_KEY`, request a code at `/_login`, then
read it from the console output (or the local D1 `verification` table) to
complete sign-in. In production, a missing `EMAIL_API_KEY` fails closed (no code
is ever logged).

## Project layout

- `src/index.ts` — wires the OAuth provider to the MCP API handler and the
  default handler (Better Auth `/api/auth/*` + login + pages).
- `src/mcp.ts` — the MCP server (`PustakMCP` Durable Object): tools, resources, prompt.
- `src/betterAuth.ts` — the Better Auth instance (D1 + email-OTP identity layer).
- `src/auth.ts` — `/authorize`, `/_login`, and the OTP flow that bridges Better Auth → the OAuth grant.
- `src/email.ts` — OTP delivery via the cfEmailSender service binding.
- `src/util.ts` — small shared helpers (email normalisation/validation).
- `src/pages.ts` — the page store, REST API and branded page serving.
- `src/branding.ts` — the injected Pustak mark for shared pages.
- `src/login-ui.ts` — the branded login screens.
- `src/explainer.ts` — the `explainer` prompt body (fill this in).
- `migrations/` — Better Auth D1 schema; `scripts/auth-gen.ts` regenerates it.
- `wrangler.jsonc` — Worker config: R2, KV, D1, the `PustakMCP` Durable Object, service binding, vars.
- `.dev.vars.example` — template for local secrets.
