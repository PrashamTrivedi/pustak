// Auth storage helpers backed by AUTH_KV: one-time passcodes and the lightweight
// user-account registry. Passwordless — verifying an OTP both logs a user in and,
// on first sight, "creates" their account.
import type { Bindings } from './types'

const OTP_TTL_SECONDS = 600 // 10 minutes
const OTP_MAX_ATTEMPTS = 5

export type UserAccount = {
  email: string
  createdAt: string
  lastLoginAt: string
}

const otpKey = (email: string) => `otp:${normaliseEmail(email)}`
const userKey = (email: string) => `user:${normaliseEmail(email)}`

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
}

/** A 6-digit numeric passcode as a zero-padded string. */
export function generateOtp(): string {
  // crypto.getRandomValues is available in Workers; avoids Math.random bias.
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}

/** Persist a freshly generated OTP for an email (replacing any prior one). */
export async function putOtp(env: Bindings, email: string, code: string): Promise<void> {
  const payload = JSON.stringify({ code, attempts: 0 })
  await env.AUTH_KV.put(otpKey(email), payload, { expirationTtl: OTP_TTL_SECONDS })
}

export type OtpResult = 'ok' | 'invalid' | 'expired' | 'too_many_attempts'

/**
 * Verify a submitted OTP. Increments an attempt counter and burns the code on
 * success or once attempts are exhausted, to blunt brute-forcing.
 */
export async function verifyOtp(env: Bindings, email: string, submitted: string): Promise<OtpResult> {
  const raw = await env.AUTH_KV.get(otpKey(email))
  if (!raw) return 'expired'
  let parsed: { code: string; attempts: number }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return 'expired'
  }
  if (parsed.attempts >= OTP_MAX_ATTEMPTS) {
    await env.AUTH_KV.delete(otpKey(email))
    return 'too_many_attempts'
  }
  if (parsed.code !== submitted.trim()) {
    parsed.attempts += 1
    await env.AUTH_KV.put(otpKey(email), JSON.stringify(parsed), { expirationTtl: OTP_TTL_SECONDS })
    return 'invalid'
  }
  await env.AUTH_KV.delete(otpKey(email))
  return 'ok'
}

/** Upsert the user record, returning it. First call creates the account. */
export async function recordLogin(env: Bindings, email: string): Promise<UserAccount> {
  const key = userKey(email)
  const now = new Date().toISOString()
  const existing = await env.AUTH_KV.get(key)
  let account: UserAccount
  if (existing) {
    account = { ...(JSON.parse(existing) as UserAccount), lastLoginAt: now }
  } else {
    account = { email: normaliseEmail(email), createdAt: now, lastLoginAt: now }
  }
  await env.AUTH_KV.put(key, JSON.stringify(account))
  return account
}

export async function getUser(env: Bindings, email: string): Promise<UserAccount | null> {
  const raw = await env.AUTH_KV.get(userKey(email))
  return raw ? (JSON.parse(raw) as UserAccount) : null
}
