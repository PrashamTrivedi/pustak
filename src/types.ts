// Bindings = the wrangler-generated env (BUCKET, OAUTH_KV, AUTH_KV, PustakMCP,
// OWNER_EMAIL, OTP_FROM_EMAIL — see worker-configuration.d.ts) plus the secrets
// and the OAuthProvider helper that aren't declared in wrangler.jsonc.
export type Bindings = Cloudflare.Env & {
  /** Legacy Bearer token guarding the REST write/list API. Optional now. */
  API_TOKEN?: string
  /** Resend API key. If unset, OTP codes are logged to the console (dev only). */
  RESEND_API_KEY?: string
  /** Injected by OAuthProvider into the default handler at runtime. */
  OAUTH_PROVIDER: import('@cloudflare/workers-oauth-provider').OAuthHelpers
}

/** The authenticated identity carried on every MCP request (this.props). */
export type Props = {
  userId: string
  email: string
}
