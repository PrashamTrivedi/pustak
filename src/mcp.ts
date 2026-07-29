// The Pustak MCP server, served statelessly over Streamable HTTP at /mcp by
// `createMcpHandler` (agents/mcp/server) on top of MCP SDK v2. The authenticated
// user arrives as OAuth props, read via `getMcpAuthContext()`. It offers:
//   • tools     — whoami, list_pages, read_page, write_page, delete_page
//   • resources — pustak://about, pustak://pages, pustak://page/{path}
//   • prompt    — explainer (body in src/explainer.ts)
//
// Why a factory rather than the old McpAgent Durable Object: the 2026-07-28
// protocol revision drops the initialize/Mcp-Session-Id handshake, so a server
// no longer needs per-session state. `createMcpHandler` calls this factory once
// per request; PustakMCP never had session state (only OAuth props + R2), so
// nothing was lost in the move. See README "MCP server".
import { McpServer, ResourceTemplate, acceptedContent, inputRequired } from '@modelcontextprotocol/server'
import type { McpRequestContext } from '@modelcontextprotocol/server'
import { getMcpAuthContext } from 'agents/mcp/server'
import { env as workerEnv } from 'cloudflare:workers'
import { z } from 'zod'
import type { Bindings, Props } from './types'
import { toKey } from './pages'
import { EXPLAINER_PROMPT_TEXT } from './explainer'

const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8'

const env = workerEnv as Bindings

/** Resolve a user-supplied, slug-relative path to a full R2 key under their slug. */
function keyFor(username: string, path: string): string {
  const rel = String(path).replace(/^\/+/, '').replace(new RegExp('^' + username + '/'), '')
  return toKey(username + '/' + rel)
}

const textResult = (text: string) => ({ content: [{ type: 'text' as const, text }] })
const errorResult = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] })

/** List every object under a user's slug prefix, following R2 pagination. */
async function listPages(base: string, prefix = '') {
  const full = base + prefix.replace(/^\/+/, '')
  const pages: { path: string; size: number; uploaded: string }[] = []
  let cursor: string | undefined
  do {
    const listing = await env.BUCKET.list({ prefix: full, cursor })
    for (const o of listing.objects) {
      pages.push({ path: o.key.slice(base.length), size: o.size, uploaded: o.uploaded.toISOString() })
    }
    cursor = listing.truncated ? listing.cursor : undefined
  } while (cursor)
  return pages
}

/**
 * Build a Pustak MCP server for one request. `ctx.era` tells us which protocol
 * generation the caller speaks, which decides how we ask for confirmation on
 * destructive writes (see `confirm()`).
 */
export function createPustakMcpServer(ctx: McpRequestContext): McpServer {
  const server = new McpServer({ name: 'pustak', version: '1.0.0' })
  const modern = ctx.era === 'modern'

  // OAuth props are put in AsyncLocalStorage by the handler around the whole
  // request, so this is read lazily inside each callback rather than captured here.
  const props = () => getMcpAuthContext()?.props as Props | undefined
  const email = () => props()?.email ?? 'unknown'
  const username = () => props()?.username ?? ''
  /** Invariant: every valid token carries a slug. Guard tools against a blank one. */
  const hasSlug = () => /^[a-z0-9-]+$/.test(username())
  const noSlug = () => errorResult('No username on this account — sign in again.')

  /**
   * Ask the user to confirm a destructive write.
   *
   * On the 2026-07-28 protocol this is a real elicitation, delivered as a
   * multi-round-trip `input_required` result: the client collects the answer and
   * re-issues the same call with `inputResponses`. Nothing is held open server-side.
   *
   * The 2025-era lane has no return path for server-initiated requests, so there
   * we degrade to an explicit `confirm: true` argument and tell the caller to
   * retry. Both paths fail closed — silence is never taken as consent.
   *
   * Returns `undefined` when the caller may proceed, or a result to return as-is.
   */
  function confirm(key: string, question: string, confirmArg: boolean | undefined, inputResponses: Record<string, unknown> | undefined) {
    if (confirmArg === true) return undefined
    if (!modern) {
      return errorResult(`${question}\n\nThis client cannot show a confirmation prompt. Re-run with confirm: true to proceed.`)
    }
    // Distinguish "not asked yet" from "asked and refused". `acceptedContent()`
    // returns undefined for both a missing entry and a declined/cancelled one, so
    // keying off it alone would re-prompt forever on every decline — the spec
    // requires a decline to be honoured, not retried.
    if (inputResponses?.[key] !== undefined) {
      const answer = acceptedContent(inputResponses, key, z.object({ confirm: z.boolean() }))
      if (answer?.confirm === true) return undefined
      return textResult('Cancelled — nothing was changed.')
    }
    return inputRequired({
      inputRequests: {
        [key]: inputRequired.elicit({
          message: question,
          requestedSchema: {
            type: 'object',
            properties: { confirm: { type: 'boolean', description: 'Proceed?' } },
            required: ['confirm'],
          },
        }),
      },
    })
  }

  // --- Tools -----------------------------------------------------------------
  // `annotations` are advisory hints clients use to decide what to auto-run and
  // what to confirm. They work on every client and every protocol revision, which
  // is why the destructive tools carry them in addition to the elicitation above.
  server.registerTool(
    'whoami',
    {
      title: 'Who am I',
      description: 'Return the authenticated Pustak account and its page space.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => textResult(`You are ${email()} (@${username()}). Your pages live under /${username()}/.`),
  )

  server.registerTool(
    'list_pages',
    {
      title: 'List pages',
      description: 'List your stored pages, optionally filtered by a slug-relative prefix.',
      inputSchema: z.object({
        prefix: z.string().optional().describe('Only paths starting with this (within your space).'),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ prefix }) => {
      if (!hasSlug()) return noSlug()
      const pages = await listPages(username() + '/', prefix ?? '')
      return textResult(JSON.stringify({ count: pages.length, username: username(), pages }, null, 2))
    },
  )

  server.registerTool(
    'read_page',
    {
      title: 'Read page',
      description: 'Return the content of one of your pages by its slug-relative path.',
      inputSchema: z.object({ path: z.string().describe('Slug-relative path, e.g. "explainers/intro".') }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      if (!hasSlug()) return noSlug()
      const key = keyFor(username(), path)
      const obj = await env.BUCKET.get(key)
      if (!obj) return errorResult(`Not found: /${key}`)
      return textResult(await obj.text())
    },
  )

  server.registerTool(
    'write_page',
    {
      title: 'Write page',
      description:
        'Create or replace a page in your space. Served at /<username>/<path>. ' +
        'Replacing an existing page asks for confirmation first.',
      inputSchema: z.object({
        path: z.string().describe('Slug-relative path, e.g. "explainers/intro".'),
        content: z.string().describe('The page body (usually HTML).'),
        contentType: z.string().optional().describe('MIME type. Defaults to text/html.'),
        confirm: z.boolean().optional().describe('Set true to confirm overwriting an existing page.'),
      }),
      // Creating is additive, but this same tool silently replaces an existing
      // page, so it is flagged destructive and non-idempotent.
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    async ({ path, content, contentType, confirm: confirmArg }, c) => {
      if (!hasSlug()) return noSlug()
      const key = keyFor(username(), path)

      // Only an overwrite needs consent; first writes go straight through.
      const existing = await env.BUCKET.head(key)
      if (existing) {
        const blocked = confirm(
          'overwrite',
          `/${key} already exists (${existing.size} bytes). Replace it?`,
          confirmArg,
          c.mcpReq.inputResponses,
        )
        if (blocked) return blocked
      }

      await env.BUCKET.put(key, content, {
        httpMetadata: { contentType: contentType || DEFAULT_CONTENT_TYPE },
        customMetadata: { owner: email() },
      })
      return textResult(`${existing ? 'Replaced' : 'Saved'} /${key} (${content.length} bytes).`)
    },
  )

  server.registerTool(
    'delete_page',
    {
      title: 'Delete page',
      description: 'Delete one of your pages by its slug-relative path. Asks for confirmation first.',
      inputSchema: z.object({
        path: z.string().describe('Slug-relative path, e.g. "explainers/intro".'),
        confirm: z.boolean().optional().describe('Set true to confirm the deletion.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, confirm: confirmArg }, c) => {
      if (!hasSlug()) return noSlug()
      const key = keyFor(username(), path)
      const existing = await env.BUCKET.head(key)
      if (!existing) return errorResult(`Not found: /${key}`)

      const blocked = confirm(
        'delete',
        `Delete /${key} (${existing.size} bytes)? R2 keeps no version history, so this cannot be undone.`,
        confirmArg,
        c.mcpReq.inputResponses,
      )
      if (blocked) return blocked

      await env.BUCKET.delete(key)
      return textResult(`Deleted /${key}.`)
    },
  )

  // --- Resources ---------------------------------------------------------------
  // Note `pustak://pages` and `pustak://page/{path}` are already mirrored by the
  // list_pages / read_page tools, so tools-only clients lose nothing here.
  server.registerResource(
    'about',
    'pustak://about',
    { title: 'About Pustak', description: 'What Pustak is and how it stores pages.', mimeType: 'text/plain' },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text:
            'Pustak stores standalone HTML pages in Cloudflare R2 and serves them from the edge. ' +
            "Each user's pages live under their username slug (/<username>/...). Reads are public; " +
            `writes are authenticated. You are ${email()} (@${username()}).`,
        },
      ],
    }),
  )

  server.registerResource(
    'pages',
    'pustak://pages',
    { title: 'Your pages', description: 'JSON index of the pages in your space.', mimeType: 'application/json' },
    async (uri) => {
      const pages = await listPages(username() + '/')
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ count: pages.length, username: username(), pages }, null, 2),
          },
        ],
      }
    },
  )

  server.registerResource(
    'page',
    new ResourceTemplate('pustak://page/{+path}', { list: undefined }),
    { title: 'Page', description: 'The content of one of your pages (slug-relative path).' },
    async (uri, { path }) => {
      const key = keyFor(username(), Array.isArray(path) ? path.join('/') : String(path))
      const obj = await env.BUCKET.get(key)
      if (!obj) return { contents: [{ uri: uri.href, text: `Not found: /${key}` }] }
      return {
        contents: [
          { uri: uri.href, mimeType: obj.httpMetadata?.contentType || DEFAULT_CONTENT_TYPE, text: await obj.text() },
        ],
      }
    },
  )

  // --- Prompt ------------------------------------------------------------------
  // "explainer" — turns a concept/article/book into a standalone interactive
  // HTML explainer (body lives in src/explainer.ts).
  server.registerPrompt(
    'explainer',
    { title: 'Explainer', description: 'Turn a concept, article, or book into a standalone, interactive HTML explainer page.' },
    () => ({ messages: [{ role: 'user' as const, content: { type: 'text' as const, text: EXPLAINER_PROMPT_TEXT } }] }),
  )

  // The explainer is deliberately NOT also mirrored as a tool for clients that
  // ignore prompts. One URL serves everyone, and a client that doesn't implement
  // prompts or resources simply doesn't see them — see README "One URL, no
  // client sniffing" for why that beats the alternatives.

  return server
}
