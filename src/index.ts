import { Hono, type Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { BROWSER_HTML, SWAGGER_HTML, openApiSpec } from './ui'

type Bindings = {
  BUCKET: R2Bucket
  /** Bearer token guarding all mutating + listing endpoints. Set via `wrangler secret put API_TOKEN`. */
  API_TOKEN: string
}

type AppContext = Context<{ Bindings: Bindings }>

const app = new Hono<{ Bindings: Bindings }>()

/**
 * Normalise a request path into an R2 object key.
 *  - strips the leading "/"
 *  - decodes percent-encoding
 *  - maps "" and any trailing "/" to "index.html"
 */
function toKey(path: string): string {
  let key = decodeURIComponent(path).replace(/^\/+/, '')
  if (key === '' || key.endsWith('/')) key += 'index.html'
  return key
}

const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8'

/** Paths owned by the Worker itself — cannot be stored as pages. */
function isReserved(path: string): boolean {
  return path === '/_browse' || path === '/_docs' || path === '/_openapi.json' || path === '/_list'
}

// --- Auth: protect mutations + the admin list endpoint -----------------------
// Reads (GET/HEAD of pages) are public; everything else requires
// `Authorization: Bearer <API_TOKEN>`. Registered before the matching route
// handlers so it runs first and calls next() only on a valid token.
const requireAuth = bearerAuth<{ Bindings: Bindings }>({
  verifyToken: (token, c) => token === c.env.API_TOKEN,
})

app.on(['PUT', 'POST', 'DELETE'], '/*', requireAuth)
app.use('/_list', requireAuth)

// --- Admin: list stored pages (auth required) --------------------------------
// GET /_list[?prefix=...] — reserved path, never served as a page.
app.get('/_list', async (c) => {
  const prefix = c.req.query('prefix') ?? undefined
  const keys: { key: string; size: number; uploaded: string; contentType?: string }[] = []
  let cursor: string | undefined
  do {
    const listing = await c.env.BUCKET.list({ prefix, cursor, include: ['httpMetadata'] })
    for (const o of listing.objects) {
      keys.push({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded.toISOString(),
        contentType: o.httpMetadata?.contentType,
      })
    }
    cursor = listing.truncated ? listing.cursor : undefined
  } while (cursor)
  return c.json({ count: keys.length, pages: keys })
})

// --- Create / update a page --------------------------------------------------
// PUT|POST /<path>  body = HTML (or any content). Stores it in R2.
const upload = async (c: AppContext) => {
  if (isReserved(c.req.path)) {
    return c.json({ error: 'Reserved path', path: c.req.path }, 403)
  }
  const key = toKey(c.req.path)
  const body = await c.req.arrayBuffer()
  if (body.byteLength === 0) {
    return c.json({ error: 'Empty body. Send the page content as the request body.' }, 400)
  }
  const contentType = c.req.header('content-type') || DEFAULT_CONTENT_TYPE
  await c.env.BUCKET.put(key, body, {
    httpMetadata: { contentType },
  })
  return c.json({ ok: true, key, size: body.byteLength, contentType }, 201)
}

app.put('/*', upload)
app.post('/*', upload)

// --- Delete a page -----------------------------------------------------------
app.delete('/*', async (c) => {
  if (isReserved(c.req.path)) {
    return c.json({ error: 'Reserved path', path: c.req.path }, 403)
  }
  const key = toKey(c.req.path)
  const existing = await c.env.BUCKET.head(key)
  if (!existing) return c.json({ error: 'Not found', key }, 404)
  await c.env.BUCKET.delete(key)
  return c.json({ ok: true, key, deleted: true })
})

// --- Built-in admin pages (public; the protected ops they call need a token) -
app.get('/_browse', (c) => c.html(BROWSER_HTML))
app.get('/_docs', (c) => c.html(SWAGGER_HTML))
app.get('/_openapi.json', (c) => c.json(openApiSpec(new URL(c.req.url).origin)))

// Root: serve a stored index.html if present, otherwise the bucket browser.
app.get('/', async (c) => {
  const object = await c.env.BUCKET.get('index.html')
  if (!object) return c.html(BROWSER_HTML)
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  if (!headers.has('content-type')) headers.set('content-type', DEFAULT_CONTENT_TYPE)
  return new Response(object.body, { headers })
})

// --- Serve a page ------------------------------------------------------------
app.get('/*', async (c) => {
  const key = toKey(c.req.path)
  const object = await c.env.BUCKET.get(key)
  if (!object) {
    return c.text(`Not found: ${key}`, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  if (!headers.has('content-type')) headers.set('content-type', DEFAULT_CONTENT_TYPE)

  return new Response(object.body, { headers })
})

export default app
