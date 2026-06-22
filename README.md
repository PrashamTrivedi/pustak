# Pustak

A tiny Cloudflare Worker that stores standalone HTML pages in R2 and serves them.
Built with [Hono](https://hono.dev). Live at **https://pustak.prashamhtrivedi.app**.

The path *is* the storage key — `PUT /docs/intro` stores a page that's then served
at `GET /docs/intro`. No database, no build step for the pages themselves.

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

## Setup & deploy

```bash
npm install

# Create the R2 bucket referenced in wrangler.jsonc
npx wrangler r2 bucket create pustak-pages

# Set the auth token (interactive prompt) for production
npx wrangler secret put API_TOKEN

# Deploy (binds the custom domain pustak.prashamhtrivedi.app)
npm run deploy
```

The custom domain route in `wrangler.jsonc` requires the `prashamhtrivedi.app`
zone to be active on the same Cloudflare account.

## Local development

```bash
cp .dev.vars.example .dev.vars   # set a local API_TOKEN
npm run dev                      # R2 is simulated locally
```

## Project layout

- `src/index.ts` — the whole Worker (Hono app: auth, upload, serve, delete, list).
- `wrangler.jsonc` — Worker config, R2 binding (`BUCKET`), custom domain route.
- `.dev.vars.example` — template for the local `API_TOKEN`.
