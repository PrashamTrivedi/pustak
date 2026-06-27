// Better Auth is Pustak's identity layer: it owns the D1 tables (user, session,
// account, verification) and the passwordless email-OTP flow. workers-oauth-
// provider remains the OAuth 2.1 authorization server in front of /mcp — Better
// Auth only establishes *who* the user is, and src/auth.ts bridges that identity
// into the OAuth grant.
//
// A fresh instance is built per request because the D1 binding (env.DB) is only
// available at request time.
import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import { D1Dialect } from 'kysely-d1'
import type { Bindings } from './types'
import { sendOtpEmail } from './email'

export type Auth = ReturnType<typeof makeAuth>

export function makeAuth(env: Bindings) {
  return betterAuth({
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: 'sqlite',
      // D1 has no interactive transactions; operations run sequentially.
      transaction: false,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth', // distinct from /mcp, /authorize, /token, /register
    // Passwordless only — no email/password, so no scrypt on the request path.
    emailAndPassword: { enabled: false },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600, // 10 minutes — matches the email copy
        // Better Auth generates, stores (verification table) and verifies the
        // code; we only deliver it, via the cfEmailSender service binding.
        async sendVerificationOTP({ email, otp }) {
          await sendOtpEmail(env, email, otp)
        },
      }),
    ],
  })
}
