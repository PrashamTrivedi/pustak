// The OAuth login/consent surface (the OAuthProvider's defaultHandler side) plus
// a standalone /_login for plain account sign-in from shared pages. Both share a
// passwordless email + OTP flow, now powered by Better Auth (identity) on D1:
//
//   email  ->  POST /login/start   (Better Auth issues + emails a 6-digit code)
//   code   ->  POST /login/verify  (Better Auth verifies + signs in; then we
//                                    finish the OAuth authorization or just
//                                    confirm sign-in)
//
// The pending OAuth request is parsed once, encoded into a hidden form field,
// and round-tripped through the two POSTs so it survives the OTP step. After
// Better Auth authenticates the user we discard its session and hand the
// identity to workers-oauth-provider's completeAuthorization — the OAuth access
// token, not the Better Auth session, is the durable credential for MCP.
import { Hono } from 'hono'
import type { AuthRequest } from '@cloudflare/workers-oauth-provider'
import type { Bindings } from './types'
import { loginPage } from './login-ui'
import { makeAuth } from './betterAuth'
import { isValidEmail, normaliseEmail } from './util'

// --- helpers: round-trip the OAuth request through the form --------------------
function encodeOAuth(req: AuthRequest): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(req))))
}
function decodeOAuth(raw: string): AuthRequest | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw)))) as AuthRequest
  } catch {
    return null
  }
}

// --- OTP-issuance throttle ----------------------------------------------------
// Returns true when either the client IP or the target email has exceeded its
// rate limit. Bindings are absent in local dev (and only enforced on
// Cloudflare's network), so a missing binding is treated as "not limited".
type RlCtx = { req: { header: (k: string) => string | undefined }; env: Bindings }
async function isRateLimited(c: RlCtx, email: string): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip') || 'unknown'
  const checks: Array<Promise<{ success: boolean }>> = []
  if (c.env.LOGIN_RATELIMIT_IP) checks.push(c.env.LOGIN_RATELIMIT_IP.limit({ key: ip }))
  if (c.env.LOGIN_RATELIMIT_EMAIL) checks.push(c.env.LOGIN_RATELIMIT_EMAIL.limit({ key: email }))
  const results = await Promise.all(checks)
  return results.some((r) => !r.success)
}

export function registerAuthRoutes(app: Hono<{ Bindings: Bindings }>) {
  // OAuth entry point — advertised to clients as authorizeEndpoint.
  app.get('/authorize', async (c) => {
    const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
    let subtitle = 'Sign in to authorize an application.'
    try {
      const client = await c.env.OAUTH_PROVIDER.lookupClient(oauthReq.clientId)
      const name = client?.clientName || client?.clientId
      if (name) subtitle = `Sign in to connect ${name} to your Pustak.`
    } catch {
      /* fall back to the generic subtitle */
    }
    return c.html(
      loginPage({
        step: 'email',
        action: '/login/start',
        hidden: { oauth: encodeOAuth(oauthReq) },
        subtitle,
      }),
    )
  })

  // Standalone sign-in / account creation (linked from the branding mark).
  app.get('/_login', (c) =>
    c.html(
      loginPage({
        step: 'email',
        action: '/login/start',
        subtitle: 'Sign in or create your Pustak account.',
      }),
    ),
  )

  // Step 1 -> 2: email submitted. Better Auth generates, stores and emails the code.
  app.post('/login/start', async (c) => {
    const form = await c.req.formData()
    const email = normaliseEmail(String(form.get('email') ?? ''))
    const oauth = form.get('oauth') ? String(form.get('oauth')) : undefined

    if (!isValidEmail(email)) {
      return c.html(
        loginPage({ step: 'email', action: '/login/start', hidden: oauth ? { oauth } : undefined, error: 'Please enter a valid email address.', email }),
        400,
      )
    }

    // Throttle OTP issuance per source IP and per target email to blunt
    // email-bomb / cost abuse. (Rate limiters are enforced on Cloudflare's
    // network; in local dev the bindings are no-ops.)
    if (await isRateLimited(c, email)) {
      return c.html(
        loginPage({ step: 'email', action: '/login/start', hidden: oauth ? { oauth } : undefined, error: 'Too many code requests. Please wait a minute and try again.', email }),
        429,
      )
    }

    try {
      await makeAuth(c.env).api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
    } catch (err) {
      console.error('OTP send failed:', err)
      return c.html(
        loginPage({ step: 'email', action: '/login/start', hidden: oauth ? { oauth } : undefined, error: 'Could not send the code right now. Please try again in a moment.', email }),
        502,
      )
    }

    return c.html(
      loginPage({
        step: 'code',
        action: '/login/verify',
        email,
        hidden: { email, ...(oauth ? { oauth } : {}) },
      }),
    )
  })

  // Step 2: Better Auth verifies + signs in (auto-registers on first use), then
  // we finish OAuth (if any) or confirm sign-in.
  app.post('/login/verify', async (c) => {
    const form = await c.req.formData()
    const email = normaliseEmail(String(form.get('email') ?? ''))
    const otp = String(form.get('code') ?? '')
    const oauthRaw = form.get('oauth') ? String(form.get('oauth')) : undefined

    let user: { id: string; email: string }
    try {
      // Direct server-side call: verifies the OTP, auto-registers if new, and
      // returns the user. The session it mints is intentionally discarded.
      const res = await makeAuth(c.env).api.signInEmailOTP({ body: { email, otp } })
      if (!res?.user) throw new Error('no user returned')
      user = { id: res.user.id, email: res.user.email }
    } catch (err) {
      console.error('OTP verify failed:', err)
      return c.html(
        loginPage({
          step: 'code',
          action: '/login/verify',
          email,
          hidden: { email, ...(oauthRaw ? { oauth: oauthRaw } : {}) },
          error: 'That code is not correct or has expired. Request a new one.',
        }),
        401,
      )
    }

    // Standalone sign-in: no OAuth request to complete.
    if (!oauthRaw) {
      return c.html(loginPage({ step: 'done', action: '/_login', email: user.email }))
    }

    const oauthReq = decodeOAuth(oauthRaw)
    if (!oauthReq) {
      return c.html(loginPage({ step: 'email', action: '/login/start', error: 'Your sign-in session expired. Please start again.' }), 400)
    }

    try {
      const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReq,
        userId: user.id,
        scope: oauthReq.scope,
        metadata: { label: user.email },
        props: { userId: user.id, email: user.email },
      })
      return Response.redirect(redirectTo, 302)
    } catch (err) {
      // Bad/expired OAuth request or unknown client — show a clean page, not a 500.
      console.error('completeAuthorization failed:', err)
      return c.html(loginPage({ step: 'email', action: '/login/start', error: 'Could not complete the sign-in request. Please start again from the application.' }), 400)
    }
  })
}
