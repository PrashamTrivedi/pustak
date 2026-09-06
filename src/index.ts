// Pustak — an HTML-pages store on Cloudflare R2, now fronted by an OAuth 2.1
// authorization server and a remote MCP server.
//
//   • @cloudflare/workers-oauth-provider is the default export: it implements
//     /token, /register and the .well-known discovery documents, validates
//     bearer tokens on /mcp, and round-trips the signed-in identity as props.
//   • Better Auth (src/betterAuth.ts) is the identity layer on D1 (accounts +
//     email-OTP). The login UI in auth.ts calls it server-side (auth.api.*) and
//     bridges the resulting identity into the OAuth grant.
//   • /authorize and the login UI live in auth.ts (the defaultHandler).
//   • The page store + REST API live in pages.ts (also the defaultHandler).
//   • /mcp is the OAuth-protected MCP server — a stateless handler (no Durable
//     Object), serving the 2026-07-28 protocol and older 2025-era clients on the
//     same endpoint. See src/mcp.ts.
//
// Note: Better Auth's own HTTP surface (/api/auth/*) is intentionally NOT mounted
// publicly. The bridge uses auth.api.* directly, so exposing the raw endpoints
// would only add an un-throttled OTP-send path and unused session issuance. Mount
// it (with a rate-limit store) if you later need Better Auth's HTTP clients.
import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { createMcpHandler } from 'agents/mcp/server'
import { registerAuthRoutes } from './auth'
import { registerPageRoutes } from './pages'
import { createPustakMcpServer } from './mcp'
import type { Bindings } from './types'

// Everything that isn't /mcp (or an OAuth endpoint the provider owns) is handled
// here: the login UI, the page store, and the admin pages.
const app = new Hono<{ Bindings: Bindings }>()
registerAuthRoutes(app)
registerPageRoutes(app)

// A fresh server per request — the handler requires a factory so concurrent
// requests can't share one instance. `legacy: 'stateless'` (the default) keeps
// serving 2025-era clients on the same URL while newer clients get 2026-07-28.
const mcpHandler = createMcpHandler(createPustakMcpServer, {
  route: '/mcp',
  // Custom domain: the handler only auto-allows localhost and workers.dev, so the
  // production hostname has to be named explicitly or every request is rejected.
  allowedHostnames: ['pustak.prashamhtrivedi.app', 'localhost', '127.0.0.1'],
})

export default new OAuthProvider<Bindings>({
  apiRoute: '/mcp',
  // Call the handler's (request, env, ctx) form, not its `.fetch` property —
  // that one is the direct-invocation overload `(request, requestOptions)`, so
  // OAuthProvider handing it `env` as the second argument would drop `ctx.props`
  // and every tool would see an unauthenticated caller.
  apiHandler: { fetch: (request, env, ctx) => mcpHandler(request, env, ctx) },
  defaultHandler: app,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  scopesSupported: ['mcp:read', 'mcp:write'],
})
