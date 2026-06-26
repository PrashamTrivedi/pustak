// Pustak — an HTML-pages store on Cloudflare R2, now fronted by an OAuth 2.1
// authorization server and a remote MCP server.
//
//   • @cloudflare/workers-oauth-provider is the default export: it implements
//     /token, /register and the .well-known discovery documents, validates
//     bearer tokens on /mcp, and round-trips the signed-in identity as props.
//   • /authorize and the email+OTP login UI live in auth.ts (the defaultHandler).
//   • The page store + REST API live in pages.ts (also the defaultHandler).
//   • /mcp is the OAuth-protected MCP server (PustakMCP, a Durable Object).
import OAuthProvider from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { registerAuthRoutes } from './auth'
import { registerPageRoutes } from './pages'
import { PustakMCP } from './mcp'
import type { Bindings } from './types'

// The Durable Object class must be exported for the runtime to find it.
export { PustakMCP }

// Everything that isn't /mcp (or an OAuth endpoint the provider owns) is handled
// here: the login UI, the page store, and the admin pages.
const app = new Hono<{ Bindings: Bindings }>()
registerAuthRoutes(app)
registerPageRoutes(app)

export default new OAuthProvider<Bindings>({
  apiRoute: '/mcp',
  apiHandler: PustakMCP.serve('/mcp', { binding: 'PustakMCP' }),
  defaultHandler: app,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',
  scopesSupported: ['mcp:read', 'mcp:write'],
})
