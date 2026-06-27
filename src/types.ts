// Bindings = the wrangler-generated env (BUCKET, OAUTH_KV, DB, PustakMCP,
// EMAIL_SENDER, OTP_FROM_EMAIL, BETTER_AUTH_URL, LOGIN_RATELIMIT_* — see
// worker-configuration.d.ts) plus the secrets and the OAuthProvider helper that
// aren't declared in wrangler.jsonc.
export type Bindings = Cloudflare.Env & {
  /** cfEmailSender API key (x-api-key). Required in prod; see OTP_DEV_ECHO. */
  EMAIL_API_KEY?: string
  /** Local-dev opt-in: when '1' and EMAIL_API_KEY is unset, log OTP to console. */
  OTP_DEV_ECHO?: string
  /** Better Auth signing secret (set via `wrangler secret put BETTER_AUTH_SECRET`). */
  BETTER_AUTH_SECRET: string
  /** Injected by OAuthProvider into the default handler at runtime. */
  OAUTH_PROVIDER: import('@cloudflare/workers-oauth-provider').OAuthHelpers
}

/** The authenticated identity carried on every MCP request (this.props). */
export type Props = {
  userId: string
  email: string
  /** The user's URL slug; their pages live under this R2 prefix. */
  username: string
}
