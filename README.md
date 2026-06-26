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

Two independent auth paths coexist:

- **OAuth 2.1 + email/OTP** (for MCP and account sign-in). The provider
  (`@cloudflare/workers-oauth-provider`) implements `/token`, `/register` and the
  `.well-known` discovery documents. The `/authorize` login UI and the standalone
  `/_login` page run the passwordless flow: enter email → receive a 6-digit code
  → verify. First sign-in creates the account. OTP codes and accounts live in the
  `AUTH_KV` namespace; grants/tokens live in `OAUTH_KV`.
- **Legacy `Authorization: Bearer <API_TOKEN>`** still guards the REST
  write/list API documented above. If `API_TOKEN` is unset, that REST API is
  closed and the MCP server is the way in.

OTP email is sent via [Resend](https://resend.com) (`RESEND_API_KEY`). In local
dev with no key set, the code is logged to the console instead.

## Setup & deploy

```bash
npm install

# Create the R2 bucket and the two KV namespaces, then paste the printed ids
# into wrangler.jsonc (OAUTH_KV / AUTH_KV).
npx wrangler r2 bucket create pustak-pages
npx wrangler kv namespace create OAUTH_KV
npx wrangler kv namespace create AUTH_KV

# Secrets
npx wrangler secret put RESEND_API_KEY   # for OTP email delivery
npx wrangler secret put API_TOKEN        # optional: legacy REST write API

# Deploy (binds the custom domain pustak.prashamhtrivedi.app)
npm run deploy
```

`OWNER_EMAIL` and `OTP_FROM_EMAIL` are plain `vars` in `wrangler.jsonc`. The
custom domain route requires the `prashamhtrivedi.app` zone to be active on the
same Cloudflare account, and the `OTP_FROM_EMAIL` domain must be verified in
Resend.

## Local development

```bash
cp .dev.vars.example .dev.vars   # optional API_TOKEN / RESEND_API_KEY
npm run dev                      # R2 + KV + Durable Objects simulated locally
```

Without `RESEND_API_KEY`, request a code at `/_login`, then read it from the
console output (or local KV) to complete sign-in.

## Project layout

- `src/index.ts` — wires the OAuth provider to the MCP API handler and the
  default (login + pages) handler.
- `src/mcp.ts` — the MCP server (`PustakMCP` Durable Object): tools, resources, prompt.
- `src/auth.ts` — `/authorize`, `/_login`, and the `/login/start` + `/login/verify` OTP flow.
- `src/store.ts` / `src/email.ts` — OTP + account storage, and Resend delivery.
- `src/pages.ts` — the page store, REST API and branded page serving.
- `src/branding.ts` — the injected Pustak mark for shared pages.
- `src/login-ui.ts` — the branded login screens.
- `src/explainer.ts` — the `explainer` prompt body (fill this in).
- `wrangler.jsonc` — Worker config: R2, KV, the `PustakMCP` Durable Object, vars.
- `.dev.vars.example` — template for local secrets.
