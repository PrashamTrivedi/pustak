# Pustak

A tiny Cloudflare Worker that stores standalone HTML pages in R2 and serves them.
Built with [Hono](https://hono.dev). Live at **https://pustak.prashamhtrivedi.app**.

Each user signs in (passwordless email + OTP) and picks a unique **username
slug**. Their pages live under that slug as the first path segment — `PUT
/<username>/docs/intro` stores a page served publicly at
`GET /<username>/docs/intro`.

On top of the page store, Pustak ships:

- **Accounts + a signed-in dashboard** — the homepage is the bucket browser for
  your own pages; anonymous visitors are redirected to login. No API token.
- **A remote MCP server** at `/mcp` (Streamable HTTP) exposing tools, resources
  and an `explainer` prompt — see [MCP server](#mcp-server).
- **OAuth 2.1 with passwordless email + OTP login** — MCP clients (e.g. Claude)
  authenticate via standard OAuth. See [Authentication](#authentication).
- **Pustak branding on shared pages** — every served HTML page carries an
  unobtrusive, dismissible mark inviting visitors to sign in / create an account,
  without getting in the way of reading.

## API

Reads are public. Writes/deletes/listing are authenticated by your **browser
session** (the same cookie set at login — there is no API token) and scoped to
your own username slug.

| Method   | Path                  | Auth | Description                                             |
| -------- | --------------------- | ---- | ------------------------------------------------------ |
| `GET`    | `/<username>/<path>`  | —    | Serve a stored page (public). `…/` → `index.html`.     |
| `PUT`    | `/<username>/<path>`  | 🍪   | Create/replace one of *your* pages. Body = content.    |
| `POST`   | `/<username>/<path>`  | 🍪   | Same as `PUT`.                                         |
| `DELETE` | `/<username>/<path>`  | 🍪   | Delete one of *your* pages.                            |
| `GET`    | `/_list`              | 🍪   | List *your* pages (paths are slug-relative).           |

🍪 = requires your login session; you may only write/delete under your own slug
(cross-slug writes → 403).

The Worker stores whatever `Content-Type` you send and replays it on `GET`
(defaults to `text/html; charset=utf-8`). Paths beginning with `_` and the
OAuth/auth routes are reserved and cannot be used as slugs or stored as pages.

## Pages & dashboard

- **`/`** and **`/_browse`** — your signed-in dashboard: list, view, upload and
  delete your own pages. Redirects to `/_login` when signed out.
- **`/_login`** — passwordless email + OTP sign-in / account creation.
- **`/_choose-username`** — first-login slug picker.
- **`/_docs`** / **`/_openapi.json`** — Swagger UI + OpenAPI 3.1 spec (the
  "try it out" calls ride your browser session).

### Example

```bash
BASE=https://pustak.prashamhtrivedi.app
# Sign in at $BASE/_login in a browser; the session cookie authenticates writes.
# Public reads need no auth:
curl "$BASE/prash-h-trivedi/explainers/after-automation.html"
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
verify and sign in, then on first login the user picks a unique **username slug**
(`/_choose-username`). For browser use, Better Auth's **session cookie** is set
and authenticates the dashboard + write/delete/list (each user scoped to their
own slug). For MCP, the identity is handed to the OAuth provider's
`completeAuthorization()` — minting the grant whose `props` (including the slug)
flow into the MCP server; the OAuth access token is the durable MCP credential.

OTP issuance (`/login/start`) is throttled per client IP and per email by two
Cloudflare `ratelimit` bindings (enforced on Cloudflare's network, no-ops in
local dev) to blunt email-bomb / cost abuse.

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

# Deploy (binds the custom domain pustak.prashamhtrivedi.app)
npm run deploy
```

The `EMAIL_SENDER` service binding targets the `cf-email-sender` Worker, which
must be deployed on the same Cloudflare account.
`OTP_FROM_EMAIL` and `BETTER_AUTH_URL` are plain `vars` in `wrangler.jsonc`;
`OTP_FROM_EMAIL` must be a bare address on `prashamhtrivedi.app` (cfEmailSender
rejects display names and other domains). The custom domain route requires the
`prashamhtrivedi.app` zone to be active on the same account.

The Better Auth D1 schema (`migrations/0001_better_auth.sql`) is generated from
`scripts/auth-gen.ts` with `npx @better-auth/cli generate` — re-run it if the
plugin set changes.

## Local development

```bash
cp .dev.vars.example .dev.vars                 # set BETTER_AUTH_SECRET; BETTER_AUTH_URL=http://localhost:<port>
npx wrangler d1 migrations apply pustak-auth --local
npm run dev                                     # R2 + KV + D1 + Durable Objects simulated locally
```

Locally, set `BETTER_AUTH_URL` to your `http://localhost:<port>` so the session
cookie isn't marked `Secure` (otherwise it won't be sent over http).

With `OTP_DEV_ECHO=1` and no `EMAIL_API_KEY`, request a code at `/_login`, then
read it from the console output (or the local D1 `verification` table) to
complete sign-in. In production, a missing `EMAIL_API_KEY` fails closed (no code
is ever logged).

## Project layout

- `src/index.ts` — wires the OAuth provider to the MCP API handler and the default (login + pages) handler.
- `src/mcp.ts` — the MCP server (`PustakMCP` Durable Object): slug-scoped tools, resources, prompt.
- `src/betterAuth.ts` — the Better Auth instance (D1 + email-OTP identity layer).
- `src/auth.ts` — `/authorize`, `/_login`, `/_choose-username`, `/logout`, the OTP flow + OAuth bridge.
- `src/session.ts` — browser session helpers (set/read/clear the Better Auth cookie).
- `src/users.ts` — username slugs: validation, reserved words, claim via D1.
- `src/email.ts` — OTP delivery via the cfEmailSender service binding.
- `src/util.ts` — small shared helpers (email normalisation/validation).
- `src/pages.ts` — the page store, session-scoped REST API, branded serving, legacy redirects.
- `src/branding.ts` — the injected Pustak mark for shared pages.
- `src/login-ui.ts` / `src/ui.ts` — the branded login screens and the session-based dashboard.
- `src/explainer.ts` — the `explainer` prompt body (fill this in).
- `migrations/` — Better Auth D1 schema + username column; `scripts/auth-gen.ts` regenerates the base schema.
- `wrangler.jsonc` — Worker config: R2, KV, D1, the `PustakMCP` Durable Object, service binding, vars.
- `.dev.vars.example` — template for local secrets.
