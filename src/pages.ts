// The original Pustak surface: store HTML pages in R2 keyed by path, serve them
// publicly, and expose a token-guarded REST API for writes/listing. Two changes
// from the first version:
//   1. stored pages carry an `owner` (email) in R2 custom metadata; pre-existing
//      pages with no owner are treated as belonging to OWNER_EMAIL.
//   2. served HTML pages get the Pustak branding mark injected (see branding.ts).
import { Hono, type Context } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { BROWSER_HTML, SWAGGER_HTML, openApiSpec } from './ui'
import { injectBranding, isHtmlContentType } from './branding'
import type { Bindings } from './types'

type AppCtx = Context<{ Bindings: Bindings }>

const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8'

/** Map a request path to an R2 object key (strip leading "/", index.html for dirs). */
export function toKey(path: string): string {
  let key = decodeURIComponent(path).replace(/^\/+/, '')
  if (key === '' || key.endsWith('/')) key += 'index.html'
  return key
}

/** Paths owned by the Worker (admin UI, OAuth, auth) — never stored as pages. */
function isReserved(path: string): boolean {
  const p = path.replace(/^\/+/, '').replace(/\/.*/, '') // first segment
  return (
    path === '/_browse' ||
    path === '/_docs' ||
    path === '/_openapi.json' ||
    path === '/_list' ||
    p === '_login' ||
    p === 'authorize' ||
    p === 'login' ||
    p === 'token' ||
    p === 'register' ||
    p === 'api' ||
    p === '.well-known'
  )
}

/** Owner recorded on a stored object, falling back to the configured OWNER_EMAIL. */
function ownerOf(c: AppCtx, obj: { customMetadata?: Record<string, string> }): string {
  return obj.customMetadata?.owner || c.env.OWNER_EMAIL
}

export function registerPageRoutes(app: Hono<{ Bindings: Bindings }>) {
  // REST writes + listing still use the legacy Bearer API_TOKEN. When the token
  // isn't configured these endpoints are simply closed (use the MCP server).
  const requireAuth = bearerAuth<{ Bindings: Bindings }>({
    verifyToken: (token, c) => !!c.env.API_TOKEN && token === c.env.API_TOKEN,
  })

  app.on(['PUT', 'POST', 'DELETE'], '/*', requireAuth)
  app.use('/_list', requireAuth)

  // GET /_list[?prefix=] — admin listing.
  app.get('/_list', async (c) => {
    const prefix = c.req.query('prefix') ?? undefined
    const keys: { key: string; size: number; uploaded: string; contentType?: string; owner: string }[] = []
    let cursor: string | undefined
    do {
      const listing = await c.env.BUCKET.list({ prefix, cursor, include: ['httpMetadata', 'customMetadata'] })
      for (const o of listing.objects) {
        keys.push({
          key: o.key,
          size: o.size,
          uploaded: o.uploaded.toISOString(),
          contentType: o.httpMetadata?.contentType,
          owner: o.customMetadata?.owner || c.env.OWNER_EMAIL,
        })
      }
      cursor = listing.truncated ? listing.cursor : undefined
    } while (cursor)
    return c.json({ count: keys.length, pages: keys })
  })

  // PUT|POST /<path> — store a page. REST writes are owned by OWNER_EMAIL.
  const upload = async (c: AppCtx) => {
    if (isReserved(c.req.path)) return c.json({ error: 'Reserved path', path: c.req.path }, 403)
    const key = toKey(c.req.path)
    const body = await c.req.arrayBuffer()
    if (body.byteLength === 0) {
      return c.json({ error: 'Empty body. Send the page content as the request body.' }, 400)
    }
    const contentType = c.req.header('content-type') || DEFAULT_CONTENT_TYPE
    await c.env.BUCKET.put(key, body, {
      httpMetadata: { contentType },
      customMetadata: { owner: c.env.OWNER_EMAIL },
    })
    return c.json({ ok: true, key, size: body.byteLength, contentType, owner: c.env.OWNER_EMAIL }, 201)
  }
  app.put('/*', upload)
  app.post('/*', upload)

  app.delete('/*', async (c) => {
    if (isReserved(c.req.path)) return c.json({ error: 'Reserved path', path: c.req.path }, 403)
    const key = toKey(c.req.path)
    const existing = await c.env.BUCKET.head(key)
    if (!existing) return c.json({ error: 'Not found', key }, 404)
    await c.env.BUCKET.delete(key)
    return c.json({ ok: true, key, deleted: true })
  })

  // Built-in admin pages (Pustak's own UI — not branded again).
  app.get('/_browse', (c) => c.html(BROWSER_HTML))
  app.get('/_docs', (c) => c.html(SWAGGER_HTML))
  app.get('/_openapi.json', (c) => c.json(openApiSpec(new URL(c.req.url).origin)))

  app.get('/', (c) => servePage(c, 'index.html'))
  app.get('/*', (c) => servePage(c, toKey(c.req.path)))
}

/** Serve a stored page, injecting Pustak branding into HTML documents. */
async function servePage(c: AppCtx, key: string): Promise<Response> {
  const object = await c.env.BUCKET.get(key)
  if (!object) {
    // For the root with no index.html, fall back to the bucket browser.
    if (key === 'index.html') return c.html(BROWSER_HTML)
    return c.text(`Not found: ${key}`, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  if (!headers.has('content-type')) headers.set('content-type', DEFAULT_CONTENT_TYPE)

  // Brand HTML pages; stream everything else untouched.
  if (isHtmlContentType(headers.get('content-type') ?? undefined)) {
    const html = injectBranding(await object.text())
    headers.delete('content-length') // body length changed
    return new Response(html, { headers })
  }
  return new Response(object.body, { headers })
}
