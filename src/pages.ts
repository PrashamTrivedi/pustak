// The page store. Each user's pages live under their username slug as the first
// R2 key segment (`<slug>/...`). Visibility is per page (public / unlisted /
// private) in R2 customMetadata; absence is unlisted. Writes/deletes/listing
// are authenticated by the browser SESSION and scoped to the caller's own slug.
import { Hono, type Context } from 'hono'
import { dashboardHtml, SWAGGER_HTML, openApiSpec } from './ui'
import { injectBranding, isHtmlContentType } from './branding'
import { getSessionUser } from './session'
import { getUsername } from './users'
import { landingHtml } from './landing'
import { loadProfile, profileHtml } from './profile'
import { notFoundResponse } from './notfound'
import { injectOgIfMissing, socialImageUrl } from './meta'
import { OG_IMAGE_PATH } from './theme'
import {
  isVisibility,
  readVisibility,
  rewriteVisibility,
  robotsHeaderFor,
  visibilityForWrite,
  type Visibility,
} from './visibility'
import { OG_PNG } from './og-png'
import type { Bindings } from './types'

type AppCtx = Context<{ Bindings: Bindings }>

const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8'

// One-time legacy redirects: the owner's pre-slug pages moved under their slug.
const LEGACY_REDIRECTS: Array<[from: string, to: string]> = [
  ['explainers/', 'prash-h-trivedi/explainers/'],
]

/** Map a request path to an R2 object key (strip leading "/", index.html for dirs). */
export function toKey(path: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    decoded = path // malformed %-encoding: fall back to the raw path, don't 500
  }
  let key = decoded.replace(/^\/+/, '')
  if (key === '' || key.endsWith('/')) key += 'index.html'
  return key
}

const firstSegment = (key: string) => key.split('/')[0]

/** Paths owned by the Worker (admin UI, OAuth, auth) — never stored as pages. */
function isReserved(path: string): boolean {
  const p = path.replace(/^\/+/, '').replace(/\/.*/, '') // first segment
  return (
    path === '/_browse' ||
    path === '/_docs' ||
    path === '/_openapi.json' ||
    path === '/_list' ||
    path === OG_IMAGE_PATH ||
    path === '/robots.txt' ||
    p === '_login' ||
    p === '_choose-username' ||
    p === 'authorize' ||
    p === 'login' ||
    p === 'logout' ||
    p === 'token' ||
    p === 'register' ||
    p === 'api' ||
    p === '.well-known'
  )
}

/** A legacy path that should 301 to its new slug-namespaced location, or null. */
function legacyRedirect(key: string): string | null {
  for (const [from, to] of LEGACY_REDIRECTS) {
    if (key.startsWith(from)) return '/' + to + key.slice(from.length)
  }
  return null
}

/** Stated visibility from query/header, or undefined when the caller omitted it. */
function visibilityFromRequest(c: AppCtx): Visibility | undefined | { error: Response } {
  const header = c.req.header('x-pustak-visibility')
  const query = c.req.query('visibility')
  const raw = header || query
  if (raw === undefined || raw === '') return undefined
  if (!isVisibility(raw)) {
    return { error: c.json({ error: 'Invalid visibility', visibility: raw }, 400) }
  }
  return raw
}

export function registerPageRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.get('/robots.txt', (c) => {
    const body = [
      'User-agent: *',
      'Disallow: /_login',
      'Disallow: /_browse',
      'Disallow: /_docs',
      'Disallow: /_list',
      'Disallow: /_choose-username',
      'Disallow: /_openapi.json',
      'Disallow: /authorize',
      'Disallow: /login',
      'Disallow: /logout',
      'Disallow: /token',
      'Disallow: /register',
      'Disallow: /api',
      'Disallow: /mcp',
      '',
      '# Public profiles are at /<username>. Unlisted and private pages send X-Robots-Tag: noindex, nofollow.',
      '# There is no sitemap; public pages and profiles are the indexable surface.',
      '',
    ].join('\n')
    return c.body(body, 200, { 'content-type': 'text/plain; charset=utf-8' })
  })

  app.get(OG_IMAGE_PATH, (c) => {
    return c.body(OG_PNG, 200, {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    })
  })

  // GET /_list — the signed-in user's own pages (prefix = "<slug>/").
  app.get('/_list', async (c) => {
    const session = await requireSlug(c)
    if ('response' in session) return session.response
    const prefix = session.username + '/'
    const keys: {
      key: string
      path: string
      size: number
      uploaded: string
      contentType?: string
      visibility: Visibility
    }[] = []
    let cursor: string | undefined
    do {
      const listing = await c.env.BUCKET.list({ prefix, cursor, include: ['httpMetadata', 'customMetadata'] })
      for (const o of listing.objects) {
        keys.push({
          key: o.key,
          path: o.key.slice(prefix.length), // slug-relative, for display
          size: o.size,
          uploaded: o.uploaded.toISOString(),
          contentType: o.httpMetadata?.contentType,
          visibility: readVisibility(o.customMetadata),
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
    const stated = visibilityFromRequest(c)
    if (stated && typeof stated !== 'string') return stated.error
    const body = await c.req.arrayBuffer()
    if (body.byteLength === 0) return c.json({ error: 'Empty body. Send the page content as the request body.' }, 400)
    const vis = await visibilityForWrite(c.env.BUCKET, key, stated)
    const contentType = c.req.header('content-type') || DEFAULT_CONTENT_TYPE
    await c.env.BUCKET.put(key, body, {
      httpMetadata: { contentType },
      customMetadata: { owner: session.email, visibility: vis },
    })
    return c.json({ ok: true, key, size: body.byteLength, contentType, visibility: vis }, 201)
  }
  app.put('/*', upload)
  app.post('/*', upload)

  app.patch('/*', async (c) => {
    const session = await requireSlug(c)
    if ('response' in session) return session.response
    if (isReserved(c.req.path)) return c.json({ error: 'Reserved path', path: c.req.path }, 403)
    const key = toKey(c.req.path)
    if (firstSegment(key) !== session.username) {
      return c.json({ error: 'Forbidden: you can only change your own pages' }, 403)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Expected JSON body {"visibility":"public"|"unlisted"|"private"}' }, 400)
    }
    const vis = (body as { visibility?: unknown }).visibility
    if (!isVisibility(vis)) return c.json({ error: 'Invalid visibility', visibility: vis }, 400)
    const result = await rewriteVisibility(c.env.BUCKET, key, vis)
    if (result === 'missing') return c.json({ error: 'Not found' }, 404)
    return c.json({ ok: true, key, visibility: vis })
  })

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

  // Homepage: landing for strangers, dashboard when signed in. /_browse stays auth-only.
  app.get('/', (c) => home(c))
  app.get('/_browse', (c) => dashboard(c))

  // Everything else: profile at a claimed slug, otherwise serve a stored page.
  app.get('/*', (c) => serveOrProfile(c))
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

async function home(c: AppCtx): Promise<Response> {
  const user = await getSessionUser(c.env, c.req.raw)
  c.header('Vary', 'Cookie')
  if (!user) return c.html(landingHtml(new URL(c.req.url).origin))
  const username = await getUsername(c.env, user.id)
  if (!username) return c.redirect('/_choose-username')
  c.header('Cache-Control', 'private, no-store')
  return c.html(dashboardHtml(username, user.email))
}

/** Render the dashboard, or redirect anonymous / slug-less visitors. */
async function dashboard(c: AppCtx): Promise<Response> {
  const user = await getSessionUser(c.env, c.req.raw)
  if (!user) return c.redirect('/_login')
  const username = await getUsername(c.env, user.id)
  if (!username) return c.redirect('/_choose-username')
  c.header('Cache-Control', 'private, no-store')
  c.header('Vary', 'Cookie')
  return c.html(dashboardHtml(username, user.email))
}

async function serveOrProfile(c: AppCtx): Promise<Response> {
  const path = c.req.path
  const key = toKey(path)
  // Bare "/<slug>" (no trailing slash): claimed usernames render a profile.
  if (!path.slice(1).includes('/') && !key.includes('.')) {
    const model = await loadProfile(c.env, c.req.raw, key)
    if (model) {
      c.header('Vary', 'Cookie')
      if (model.isOwner) c.header('Cache-Control', 'private, no-store')
      return c.html(profileHtml(model))
    }
  }
  return servePage(c, key)
}

/** Serve a stored page, injecting Pustak branding into HTML documents. */
async function servePage(c: AppCtx, key: string): Promise<Response> {
  const redirect = legacyRedirect(key)
  if (redirect) return c.redirect(redirect, 301)

  const object = await c.env.BUCKET.get(key)
  if (!object) {
    // Bare "/<slug>" with no extension and no user → try its index via a trailing slash.
    if (!key.includes('/') && !key.includes('.')) return c.redirect('/' + key + '/', 302)
    return notFoundResponse()
  }

  const visibility = readVisibility(object.customMetadata)
  if (visibility === 'private') {
    const session = await getSessionUser(c.env, c.req.raw)
    const ownerSlug = firstSegment(key)
    const isOwner = !!session && (await getUsername(c.env, session.id)) === ownerSlug
    if (!isOwner) return notFoundResponse()
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  if (!headers.has('content-type')) headers.set('content-type', DEFAULT_CONTENT_TYPE)
  const robots = robotsHeaderFor(visibility)
  if (robots) headers.set('X-Robots-Tag', robots)

  const embed = c.req.query('pustak-embed') === '1'
  if (isHtmlContentType(headers.get('content-type') ?? undefined)) {
    let html = await object.text()
    html = injectBranding(html, { embed })
    if (!embed) {
      const origin = new URL(c.req.url).origin
      const pathTitle = key.split('/').pop() || key
      html = injectOgIfMissing(html, {
        title: pathTitle,
        description: `A page on Pustak.`,
        url: origin + c.req.path,
        image: socialImageUrl(origin),
      })
    }
    headers.delete('content-length')
    return new Response(html, { headers })
  }
  return new Response(object.body, { headers })
}
