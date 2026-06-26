// The OAuth login/consent surface (the OAuthProvider's defaultHandler side) plus
// a standalone /_login for plain account sign-in from shared pages. Both share a
// passwordless email + OTP flow:
//
//   email  ->  POST /login/start   (generate + email a 6-digit code)
//   code   ->  POST /login/verify  (check code, then either finish the OAuth
//                                    authorization or just confirm sign-in)
//
// The pending OAuth request is parsed once, encoded into a hidden form field,
// and round-tripped through the two POSTs so it survives the OTP step.
import { Hono } from 'hono'
import type { AuthRequest } from '@cloudflare/workers-oauth-provider'
import type { Bindings } from './types'
import { loginPage } from './login-ui'
import { sendOtpEmail } from './email'
import { generateOtp, isValidEmail, normaliseEmail, putOtp, recordLogin, verifyOtp } from './store'
import type { OtpResult } from './store'

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

function otpResultMessage(result: Exclude<OtpResult, 'ok'>): string {
  switch (result) {
    case 'expired':
      return 'That code has expired or was never sent. Please request a new one.'
    case 'too_many_attempts':
      return 'Too many incorrect attempts. Please request a new code.'
    default:
      return 'That code is not correct. Check the digits and try again.'
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

  // Step 1 -> 2: email submitted, send a code.
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

    const code = generateOtp()
    await putOtp(c.env, email, code)
    try {
      await sendOtpEmail(c.env, email, code)
    } catch (err) {
      console.error('OTP email failed:', err)
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

  // Step 2: verify the code, then finish OAuth (if any) or confirm sign-in.
  app.post('/login/verify', async (c) => {
    const form = await c.req.formData()
    const email = normaliseEmail(String(form.get('email') ?? ''))
    const submitted = String(form.get('code') ?? '')
    const oauthRaw = form.get('oauth') ? String(form.get('oauth')) : undefined

    const result = await verifyOtp(c.env, email, submitted)
    if (result !== 'ok') {
      return c.html(
        loginPage({
          step: 'code',
          action: '/login/verify',
          email,
          hidden: { email, ...(oauthRaw ? { oauth: oauthRaw } : {}) },
          error: otpResultMessage(result),
        }),
        401,
      )
    }

    await recordLogin(c.env, email)

    // Standalone sign-in: no OAuth request to complete.
    if (!oauthRaw) {
      return c.html(loginPage({ step: 'done', action: '/_login', email }))
    }

    const oauthReq = decodeOAuth(oauthRaw)
    if (!oauthReq) {
      return c.html(loginPage({ step: 'email', action: '/login/start', error: 'Your sign-in session expired. Please start again.' }), 400)
    }

    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReq,
      userId: email,
      scope: oauthReq.scope,
      metadata: { label: email },
      props: { userId: email, email },
    })
    return Response.redirect(redirectTo, 302)
  })
}
