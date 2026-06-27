// Throwaway config used ONLY by `@better-auth/cli generate` to emit the D1
// migration SQL. It mirrors the real plugin set in src/betterAuth.ts (core +
// emailOTP) over a local better-sqlite3 database so the CLI can introspect the
// schema. Not bundled into the Worker.
import { betterAuth } from 'better-auth'
import { emailOTP } from 'better-auth/plugins'
import Database from 'better-sqlite3'

export const auth = betterAuth({
  database: new Database(':memory:'),
  emailAndPassword: { enabled: false },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      async sendVerificationOTP() {
        /* delivery happens in the Worker, not during schema generation */
      },
    }),
  ],
})
