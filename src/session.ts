// Browser sessions, backed by Better Auth (D1 `session` table). The login flow
// signs the user in and forwards Better Auth's Set-Cookie to the browser; every
// other request is authenticated by reading that cookie back via getSession.
// This is what replaces the old API_TOKEN for the bucket browser.
import { makeAuth } from './betterAuth'
import type { Bindings } from './types'

export type SessionUser = { id: string; email: string }

/** Verify an email OTP and, on success, return the user + Set-Cookie headers. */
export async function verifyOtpSignIn(
  env: Bindings,
  email: string,
  otp: string,
): Promise<{ user: SessionUser; cookies: string[] } | null> {
  const res = await makeAuth(env).api.signInEmailOTP({ body: { email, otp }, asResponse: true })
  if (!res.ok) return null
  const data = (await res.json().catch(() => null)) as { user?: { id: string; email: string } } | null
  if (!data?.user) return null
  return { user: { id: data.user.id, email: data.user.email }, cookies: res.headers.getSetCookie() }
}

/** Resolve the signed-in user from the request's session cookie, or null. */
export async function getSessionUser(env: Bindings, request: Request): Promise<SessionUser | null> {
  try {
    const s = await makeAuth(env).api.getSession({ headers: request.headers })
    return s?.user ? { id: s.user.id, email: s.user.email } : null
  } catch {
    return null
  }
}

/** Set-Cookie headers that clear the session. */
export async function signOutCookies(env: Bindings, request: Request): Promise<string[]> {
  try {
    const res = await makeAuth(env).api.signOut({ headers: request.headers, asResponse: true })
    return res.headers.getSetCookie()
  } catch {
    return []
  }
}

/** Build a redirect Response carrying any Set-Cookie headers. */
export function redirectWithCookies(location: string, cookies: string[] = [], status = 302): Response {
  const headers = new Headers({ location })
  for (const c of cookies) headers.append('set-cookie', c)
  return new Response(null, { status, headers })
}
