// The page store. Each user's pages live under their username slug as the first
// R2 key segment (`<slug>/...`). Reads are public (with the Pustak branding mark
// injected into HTML); writes/deletes/listing are authenticated by the browser
// SESSION (no API token) and scoped to the caller's own slug. The homepage is
// the signed-in dashboard — anonymous visitors are sent to login.
import { Hono, type Context } from 'hono'
import { dashboardHtml, SWAGGER_HTML, openApiSpec } from './ui'
import { injectBranding, isHtmlContentType } from './branding'
import { getSessionUser } from './session'
import { getUsername } from './users'
import type { Bindings } from './types'

type AppCtx = Context<{ Bindings: Bindings }>

const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8'

// One-time legacy redirects: the owner's pre-slug pages moved under their slug.
const LEGACY_REDIRECTS: Array<[from: string, to: string]> = [
  ['explainers/', 'prash-h-trivedi/explainers/'],
]

/** Map a request path to an R2 object key (strip leading "/", index.html for dirs). */
export function toKey(path: string): string {
  let key = decodeURIComponent(path).replace(/^\/+/, '')
  if (key === '' || key.endsWith('/')) key += 'index.html'
  return key
}

const firstSegment = (key: string) => key.split('/')[0]

/** Paths owned by the Worker (admin UI, OAuth, auth) — never stored as pages. */
function isReserved(path: string): boolean {
  const p = path.replace(/^\/+/, '').replace(/\/.*/, '') // first segment
  return (
    path === '/_browse' || path === '/_docs' || path === '/_openapi.json' || path === '/_list' ||
    p === '_login' || p === '_choose-username' || p === 'authorize' || p === 'login' ||
    p === 'logout' || p === 'token' || p === 'register' || p === 'api' || p === '.well-known'
  )
}

/** A legacy path that should 301 to its new slug-namespaced location, or null. */
function legacyRedirect(key: string): string | null {
  for (const [from, to] of LEGACY_REDIRECTS) {
    if (key.startsWith(from)) return '/' + to + key.slice(from.length)
  }
  return null
}

export function registerPageRoutes(app: Hono<{ Bindings: Bindings }>) {
  // GET /_list — the signed-in user's own pages (prefix = "<slug>/").
  app.get('/_list', async (c) => {
    const session = await requireSlug(c)
    if ('response' in session) return session.response
    const prefix = session.username + '/'
    const keys: { key: string; path: string; size: number; uploaded: string; contentType?: string }[] = []
    let cursor: string | undefined
    do {
      const listing = await c.env.BUCKET.list({ prefix, cursor, include: ['httpMetadata'] })
      for (const o of listing.objects) {
        keys.push({
          key: o.key,
          path: o.key.slice(prefix.length), // slug-relative, for display
          size: o.size,
          uploaded: o.uploaded.toISOString(),
          contentType: o.httpMetadata?.contentType,
        })
      }
      cursor = listing.truncated ? listing.cursor : undefined
    } while (cursor)
    return c.json({ count: keys.length, username: session.username, pages: keys })
  })

  // PUT|POST /<slug>/<path> — store a page under your own slug.
  const upload = async (c: AppCtx) => {
    const session = await requireSlug(c)
    if ('response' in session) return session.response
    if (isReserved(c.req.path)) return c.json({ error: 'Reserved path', path: c.req.path }, 403)
    const key = toKey(c.req.path)
    if (firstSegment(key) !== session.username) {
      return c.json({ error: 'Forbidden: write under your own username, e.g. /' + session.username + '/<path>' }, 403)
    }
    const body = await c.req.arrayBuffer()
    if (body.byteLength === 0) return c.json({ error: 'Empty body. Send the page content as the request body.' }, 400)
    const contentType = c.req.header('content-type') || DEFAULT_CONTENT_TYPE
    await c.env.BUCKET.put(key, body, { httpMetadata: { contentType }, customMetadata: { owner: session.email } })
    return c.json({ ok: true, key, size: body.byteLength, contentType }, 201)
  }
  app.put('/*', upload)
  app.post('/*', upload)

  app.delete('/*', async (c) => {
    const session = await requireSlug(c)
    if ('response' in session) return session.response
    if (isReserved(c.req.path)) return c.json({ error: 'Reserved path', path: c.req.path }, 403)
    const key = toKey(c.req.path)
    if (firstSegment(key) !== session.username) {
      return c.json({ error: 'Forbidden: you can only delete your own pages' }, 403)
    }
    const existing = await c.env.BUCKET.head(key)
    if (!existing) return c.json({ error: 'Not found', key }, 404)
    await c.env.BUCKET.delete(key)
    return c.json({ ok: true, key, deleted: true })
  })

  // Built-in pages.
  app.get('/_docs', (c) => c.html(SWAGGER_HTML))
  app.get('/_openapi.json', (c) => c.json(openApiSpec(new URL(c.req.url).origin)))

  // Homepage + /_browse: the signed-in dashboard (anonymous -> login).
  app.get('/', (c) => dashboard(c))
  app.get('/_browse', (c) => dashboard(c))

  // Everything else: serve a stored page publicly.
  app.get('/*', (c) => servePage(c, toKey(c.req.path)))
}

type SlugSession = { userId: string; email: string; username: string }

/** Require a session AND a chosen username, or return a redirect/JSON response. */
async function requireSlug(c: AppCtx): Promise<SlugSession | { response: Response }> {
  const user = await getSessionUser(c.env, c.req.raw)
  if (!user) return { response: c.json({ error: 'Not signed in' }, 401) }
  const username = await getUsername(c.env, user.id)
  if (!username) return { response: c.json({ error: 'Choose a username first', next: '/_choose-username' }, 403) }
  return { userId: user.id, email: user.email, username }
}

/** Render the dashboard, or redirect anonymous / slug-less visitors. */
async function dashboard(c: AppCtx): Promise<Response> {
  const user = await getSessionUser(c.env, c.req.raw)
  if (!user) return c.redirect('/_login')
  const username = await getUsername(c.env, user.id)
  if (!username) return c.redirect('/_choose-username')
  return c.html(dashboardHtml(username, user.email))
}

/** Serve a stored page, injecting Pustak branding into HTML documents. */
async function servePage(c: AppCtx, key: string): Promise<Response> {
  const redirect = legacyRedirect(key)
  if (redirect) return c.redirect(redirect, 301)

  const object = await c.env.BUCKET.get(key)
  if (!object) {
    // Bare "/<slug>" with no extension -> try its index via a trailing slash.
    if (!key.includes('/') && !key.includes('.')) return c.redirect('/' + key + '/', 302)
    return c.text(`Not found: ${key}`, 404)
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  if (!headers.has('content-type')) headers.set('content-type', DEFAULT_CONTENT_TYPE)

  if (isHtmlContentType(headers.get('content-type') ?? undefined)) {
    const html = injectBranding(await object.text())
    headers.delete('content-length')
    return new Response(html, { headers })
  }
  return new Response(object.body, { headers })
}
