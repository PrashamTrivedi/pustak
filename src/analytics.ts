// PostHog: first-party reverse proxy at /e plus fire-and-forget server capture.
// POSTHOG_KEY is a Wrangler secret. Distinct id is the auth user id; nothing
// else that could identify a person is sent.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Bindings } from './types'

export const POSTHOG_PROXY_PREFIX = '/e'
export const POSTHOG_API_HOST = 'https://us.i.posthog.com'
export const POSTHOG_ASSET_HOST = 'https://us-assets.i.posthog.com'
export const POSTHOG_UI_HOST = 'https://us.posthog.com'

const ALLOWED_PROPS = new Set(['tool', 'status', 'ok', 'method'])

const STRIP_REQUEST_HEADERS = [
  'cookie',
  'authorization',
  'cookie2',
  'host',
  'cf-connecting-ip',
  'cf-ipcountry',
  'true-client-ip',
  'x-real-ip',
  'x-forwarded-for',
  'x-forwarded-host',
  'forwarded',
]

type AnalyticsStore = { env: Bindings; ctx: AnalyticsCtx }

/** Hono and Wrangler disagree on ExecutionContext generics; we only need waitUntil. */
export type AnalyticsCtx = { waitUntil(promise: Promise<unknown>): void }

const analyticsAls = new AsyncLocalStorage<AnalyticsStore>()

export function withAnalytics<T>(env: Bindings, ctx: AnalyticsCtx, fn: () => T): T {
  return analyticsAls.run({ env, ctx }, fn)
}

/** Rewrite an incoming /e/... path to the PostHog origin path. */
export function posthogOriginPath(pathname: string): string {
  if (pathname === POSTHOG_PROXY_PREFIX || pathname === POSTHOG_PROXY_PREFIX + '/') return '/'
  if (pathname.startsWith(POSTHOG_PROXY_PREFIX + '/')) return pathname.slice(POSTHOG_PROXY_PREFIX.length)
  return pathname
}

export function isPosthogAssetPath(pathname: string): boolean {
  return pathname.startsWith('/static/') || pathname.startsWith('/array/')
}

/** Drop cookies, auth, and client IP so PostHog never sees them. */
export function stripProxyHeaders(headers: Headers): Headers {
  const out = new Headers(headers)
  for (const name of STRIP_REQUEST_HEADERS) out.delete(name)
  return out
}

export function isPiiPropertyKey(key: string): boolean {
  const k = key.toLowerCase()
  if (k === '$geoip_disable') return false
  if (k === '$ip' || k.startsWith('$geoip_')) return true
  if (k.includes('email') || k.includes('phone')) return true
  return k === 'name' || k === '$name' || k === '$set' || k === '$set_once'
}

export function mcpToolStatus(result: unknown): 'ok' | 'error' | 'confirm' | 'cancel' {
  if (!result || typeof result !== 'object') return 'ok'
  const r = result as Record<string, unknown>
  if (r.isError === true) return 'error'
  if (r.inputRequests && typeof r.inputRequests === 'object') return 'confirm'
  const content = r.content
  if (Array.isArray(content) && content[0] && typeof content[0] === 'object') {
    const text = (content[0] as { text?: unknown }).text
    if (typeof text === 'string' && text.startsWith('Cancelled')) return 'cancel'
  }
  return 'ok'
}

export type CaptureEvent = 'api_list' | 'api_write' | 'api_visibility' | 'api_delete' | 'mcp_tool'

export function buildCapturePayload(
  apiKey: string,
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    $lib: 'pustak-worker',
    $geoip_disable: true,
  }
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPS.has(key)) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      props[key] = value
    }
  }
  return {
    api_key: apiKey,
    event,
    distinct_id: distinctId,
    properties: props,
  }
}

/** Queue a capture. No-ops without a user id, a key, or a request context. */
export function track(event: CaptureEvent, distinctId: string | undefined, properties?: Record<string, unknown>): void {
  if (!distinctId) return
  const store = analyticsAls.getStore()
  const key = store?.env.POSTHOG_KEY
  if (!store || !key) return
  store.ctx.waitUntil(sendCapture(key, event, distinctId, properties))
}

async function sendCapture(
  apiKey: string,
  event: string,
  distinctId: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 3000)
  try {
    await fetch(`${POSTHOG_API_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildCapturePayload(apiKey, event, distinctId, properties)),
      signal: ctrl.signal,
    })
  } catch {
    // Analytics must never fail the caller.
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Proxy a browser request under /e to PostHog. Assets are cached; events stream.
 * Client IP is intentionally not forwarded.
 */
export async function handlePosthogProxy(request: Request, ctx: AnalyticsCtx): Promise<Response> {
  const url = new URL(request.url)
  const pathname = posthogOriginPath(url.pathname)
  const pathWithSearch = pathname + url.search
  if (request.method === 'GET' && isPosthogAssetPath(pathname)) {
    return retrieveAsset(request, pathWithSearch, ctx)
  }
  return forwardRequest(request, pathWithSearch)
}

async function retrieveAsset(request: Request, pathWithSearch: string, ctx: AnalyticsCtx): Promise<Response> {
  try {
    const hit = await caches.default.match(request)
    if (hit) return hit
  } catch {
    // Cache API can be missing in some test runtimes.
  }
  const response = await fetch(`https://${new URL(POSTHOG_ASSET_HOST).host}${pathWithSearch}`, {
    method: request.method,
    headers: stripProxyHeaders(request.headers),
    redirect: 'manual',
  })
  if (response.ok) {
    try {
      ctx.waitUntil(caches.default.put(request, response.clone()))
    } catch {
      // ignore cache put failures
    }
  }
  return response
}

async function forwardRequest(request: Request, pathWithSearch: string): Promise<Response> {
  const method = request.method.toUpperCase()
  const originRequest = new Request(`${POSTHOG_API_HOST}${pathWithSearch}`, {
    method: request.method,
    headers: stripProxyHeaders(request.headers),
    body: method === 'GET' || method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  })
  return fetch(originRequest)
}

/** Official snippet, pointed at our /e proxy, with PII stripped before send. */
export function posthogSnippet(key: string): string {
  const apiHost = JSON.stringify(POSTHOG_PROXY_PREFIX)
  const token = JSON.stringify(key)
  const uiHost = JSON.stringify(POSTHOG_UI_HOST)
  return `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${token}, {
  api_host: ${apiHost},
  ui_host: ${uiHost},
  defaults: '2026-05-30',
  person_profiles: 'identified_only',
  ip: false,
  property_denylist: ['$ip', '$email', 'email', 'name', '$name'],
  session_recording: { maskAllInputs: true },
  before_send: function (event) {
    if (!event || !event.properties) return event
    var p = event.properties
    for (var k in p) {
      if (!Object.prototype.hasOwnProperty.call(p, k)) continue
      var l = k.toLowerCase()
      if (l === '$geoip_disable') continue
      if (l === '$ip' || l.indexOf('$geoip_') === 0 || l.indexOf('email') !== -1 || l.indexOf('phone') !== -1 || l === 'name' || l === '$name' || l === '$set' || l === '$set_once') delete p[k]
    }
    p.$geoip_disable = true
    return event
  },
  loaded: function (ph) {
    document.querySelectorAll('[data-ph]').forEach(function (el) {
      el.addEventListener('click', function () {
        var name = el.getAttribute('data-ph')
        if (name) ph.capture(name)
      })
    })
  }
})
</script>`
}
