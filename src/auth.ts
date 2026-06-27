// The login surface: the OAuth /authorize flow and the standalone /_login, both
// driven by Better Auth's passwordless email-OTP (identity on D1):
//
//   email  ->  POST /login/start    (Better Auth issues + emails a 6-digit code)
//   code   ->  POST /login/verify   (Better Auth verifies + signs in; sets a
//                                     browser session cookie)
//   slug   ->  GET/POST /_choose-username  (first-login: pick a unique slug)
//
// After sign-in the user lands in their dashboard (browser) or, in the OAuth
// flow, the identity is handed to workers-oauth-provider's completeAuthorization
// (the OAuth token, not the session cookie, is the durable MCP credential). A
// username slug is required before either completes, so props.username is always
// set downstream.
import { Hono, type Context } from 'hono'
import type { AuthRequest } from '@cloudflare/workers-oauth-provider'
import type { Bindings, Props } from './types'
import { loginPage } from './login-ui'
import { makeAuth } from './betterAuth'
import { isValidEmail, normaliseEmail } from './util'
import { getSessionUser, redirectWithCookies, signOutCookies, verifyOtpSignIn } from './session'
import { getUsername, setUsername, slugifyEmail, type SetUsernameResult } from './users'

type Ctx = Context<{ Bindings: Bindings }>

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

/** Render HTML while appending any Set-Cookie headers (e.g. a fresh session). */
function htmlWithCookies(c: Ctx, html: string, cookies: string[], status = 200 as number) {
  for (const ck of cookies) c.header('set-cookie', ck, { append: true })
  return c.html(html, status as 200)
}

const slugErrors: Record<Exclude<SetUsernameResult, 'ok'>, string> = {
  invalid: 'Use 2–32 lowercase letters, numbers or hyphens (no leading/trailing hyphen).',
  reserved: 'That name is reserved. Please choose another.',
  taken: 'That username is already taken. Please choose another.',
}

// --- OTP-issuance throttle ----------------------------------------------------
type RlCtx = { req: { header: (k: string) => string | undefined }; env: Bindings }
async function isRateLimited(c: RlCtx, email: string): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip') || 'unknown'
  const checks: Array<Promise<{ success: boolean }>> = []
  if (c.env.LOGIN_RATELIMIT_IP) checks.push(c.env.LOGIN_RATELIMIT_IP.limit({ key: ip }))
  if (c.env.LOGIN_RATELIMIT_EMAIL) checks.push(c.env.LOGIN_RATELIMIT_EMAIL.limit({ key: email }))
  const results = await Promise.all(checks)
  return results.some((r) => !r.success)
}

/** Finish the OAuth authorization once we know the user + slug. */
async function completeOAuth(c: Ctx, oauthReq: AuthRequest, props: Props, cookies: string[]) {
  try {
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReq,
      userId: props.userId,
      scope: oauthReq.scope,
      metadata: { label: props.email },
      props,
    })
    return redirectWithCookies(redirectTo, cookies)
  } catch (err) {
    console.error('completeAuthorization failed:', err)
    return c.html(loginPage({ step: 'email', action: '/login/start', error: 'Could not complete the sign-in request. Please start again from the application.' }), 400)
  }
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
      loginPage({ step: 'email', action: '/login/start', hidden: { oauth: encodeOAuth(oauthReq) }, subtitle }),
    )
  })

  // Standalone sign-in / account creation (linked from the branding mark).
  app.get('/_login', async (c) => {
    // Already signed in with a slug? Skip straight to the dashboard.
    const user = await getSessionUser(c.env, c.req.raw)
    if (user && (await getUsername(c.env, user.id))) return c.redirect('/')
    return c.html(loginPage({ step: 'email', action: '/login/start', subtitle: 'Sign in or create your Pustak account.' }))
  })

  // Step 1 -> 2: email submitted. Better Auth generates, stores and emails the code.
  app.post('/login/start', async (c) => {
    const form = await c.req.formData()
    const email = normaliseEmail(String(form.get('email') ?? ''))
    const oauth = form.get('oauth') ? String(form.get('oauth')) : undefined

    if (!isValidEmail(email)) {
      return c.html(loginPage({ step: 'email', action: '/login/start', hidden: oauth ? { oauth } : undefined, error: 'Please enter a valid email address.', email }), 400)
    }
    if (await isRateLimited(c, email)) {
      return c.html(loginPage({ step: 'email', action: '/login/start', hidden: oauth ? { oauth } : undefined, error: 'Too many code requests. Please wait a minute and try again.', email }), 429)
    }

    try {
      await makeAuth(c.env).api.sendVerificationOTP({ body: { email, type: 'sign-in' } })
    } catch (err) {
      console.error('OTP send failed:', err)
      return c.html(loginPage({ step: 'email', action: '/login/start', hidden: oauth ? { oauth } : undefined, error: 'Could not send the code right now. Please try again in a moment.', email }), 502)
    }

    return c.html(loginPage({ step: 'code', action: '/login/verify', email, hidden: { email, ...(oauth ? { oauth } : {}) } }))
  })

  // Step 2: Better Auth verifies + signs in (auto-registers on first use). We set
  // the session cookie, then route to username onboarding, OAuth completion, or
  // the dashboard.
  app.post('/login/verify', async (c) => {
    const form = await c.req.formData()
    const email = normaliseEmail(String(form.get('email') ?? ''))
    const otp = String(form.get('code') ?? '')
    const oauthRaw = form.get('oauth') ? String(form.get('oauth')) : undefined

    const result = await verifyOtpSignIn(c.env, email, otp)
    if (!result) {
      return c.html(
        loginPage({ step: 'code', action: '/login/verify', email, hidden: { email, ...(oauthRaw ? { oauth: oauthRaw } : {}) }, error: 'That code is not correct or has expired. Request a new one.' }),
        401,
      )
    }
    const { user, cookies } = result
    const username = await getUsername(c.env, user.id)

    // First login: must pick a slug before anything completes. Carry oauth (if
    // any) through onboarding; the session cookie authenticates the next POST.
    if (!username) {
      return htmlWithCookies(
        c,
        loginPage({ step: 'username', action: '/_choose-username', slug: slugifyEmail(user.email), hidden: oauthRaw ? { oauth: oauthRaw } : undefined, subtitle: `Welcome, ${user.email}` }),
        cookies,
      )
    }

    if (oauthRaw) {
      const oauthReq = decodeOAuth(oauthRaw)
      if (!oauthReq) return c.html(loginPage({ step: 'email', action: '/login/start', error: 'Your sign-in session expired. Please start again.' }), 400)
      return completeOAuth(c, oauthReq, { userId: user.id, email: user.email, username }, cookies)
    }
    // Browser sign-in: into the dashboard.
    return redirectWithCookies('/', cookies)
  })

  // First-login slug picker. Requires a session; carries oauth through if present.
  app.get('/_choose-username', async (c) => {
    const user = await getSessionUser(c.env, c.req.raw)
    if (!user) return c.redirect('/_login')
    const existing = await getUsername(c.env, user.id)
    const oauth = c.req.query('oauth')
    if (existing && !oauth) return c.redirect('/')
    return c.html(loginPage({ step: 'username', action: '/_choose-username', slug: existing ?? slugifyEmail(user.email), hidden: oauth ? { oauth } : undefined, subtitle: `Welcome, ${user.email}` }))
  })

  app.post('/_choose-username', async (c) => {
    const user = await getSessionUser(c.env, c.req.raw)
    if (!user) return c.redirect('/_login')
    const form = await c.req.formData()
    const slug = String(form.get('username') ?? '')
    const oauthRaw = form.get('oauth') ? String(form.get('oauth')) : undefined

    const res = await setUsername(c.env, user.id, slug)
    if (res !== 'ok') {
      return c.html(loginPage({ step: 'username', action: '/_choose-username', slug, hidden: oauthRaw ? { oauth: oauthRaw } : undefined, error: slugErrors[res], subtitle: `Welcome, ${user.email}` }), res === 'taken' ? 409 : 400)
    }
    const username = slug.trim().toLowerCase()

    if (oauthRaw) {
      const oauthReq = decodeOAuth(oauthRaw)
      if (!oauthReq) return c.html(loginPage({ step: 'email', action: '/login/start', error: 'Your sign-in session expired. Please start again.' }), 400)
      return completeOAuth(c, oauthReq, { userId: user.id, email: user.email, username }, [])
    }
    return c.redirect('/')
  })

  // Sign out: clear the session, back to login.
  app.get('/logout', async (c) => redirectWithCookies('/_login', await signOutCookies(c.env, c.req.raw)))
  app.post('/logout', async (c) => redirectWithCookies('/_login', await signOutCookies(c.env, c.req.raw)))
}
