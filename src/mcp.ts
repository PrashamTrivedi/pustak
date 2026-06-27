// The Pustak MCP server, exposed as a per-session Durable Object (McpAgent) over
// Streamable HTTP at /mcp. The authenticated user arrives as this.props (set by
// the OAuth flow in auth.ts). It offers:
//   • tools     — whoami, list_pages, read_page, write_page, delete_page
//   • resources — pustak://about, pustak://pages, pustak://page/{path}
//   • prompt    — explainer (placeholder; see src/explainer.ts)
import { McpAgent } from 'agents/mcp'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { Bindings, Props } from './types'
import { toKey } from './pages'
import { EXPLAINER_PROMPT_TEXT } from './explainer'

const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8'

export class PustakMCP extends McpAgent<Bindings, unknown, Props> {
  server = new McpServer({ name: 'pustak', version: '1.0.0' })

  /** The signed-in email, or a clear marker if props somehow weren't set. */
  private get email(): string {
    return this.props?.email ?? 'unknown'
  }

  private owns(customMetadata?: Record<string, string>): boolean {
    const owner = customMetadata?.owner || this.env.OWNER_EMAIL
    return owner === this.email || this.email === this.env.OWNER_EMAIL
  }

  async init() {
    const { server } = this

    // --- Tools ---------------------------------------------------------------
    server.registerTool(
      'whoami',
      { title: 'Who am I', description: 'Return the authenticated Pustak account.' },
      async () => ({ content: [{ type: 'text', text: `You are signed in as ${this.email}.` }] }),
    )

    server.registerTool(
      'list_pages',
      {
        title: 'List pages',
        description: 'List stored pages, optionally filtered by a key prefix.',
        inputSchema: { prefix: z.string().optional().describe('Only keys starting with this prefix.') },
      },
      async ({ prefix }) => {
        const pages: { key: string; size: number; uploaded: string; owner: string }[] = []
        let cursor: string | undefined
        do {
          const listing = await this.env.BUCKET.list({ prefix, cursor, include: ['customMetadata'] })
          for (const o of listing.objects) {
            pages.push({
              key: o.key,
              size: o.size,
              uploaded: o.uploaded.toISOString(),
              owner: o.customMetadata?.owner || this.env.OWNER_EMAIL,
            })
          }
          cursor = listing.truncated ? listing.cursor : undefined
        } while (cursor)
        return {
          content: [{ type: 'text', text: JSON.stringify({ count: pages.length, pages }, null, 2) }],
        }
      },
    )

    server.registerTool(
      'read_page',
      {
        title: 'Read page',
        description: 'Return the stored content of a page by its path/key.',
        inputSchema: { path: z.string().describe('Page path, e.g. "docs/intro".') },
      },
      async ({ path }) => {
        const key = toKey(path)
        const obj = await this.env.BUCKET.get(key)
        if (!obj) return { isError: true, content: [{ type: 'text', text: `Not found: ${key}` }] }
        return { content: [{ type: 'text', text: await obj.text() }] }
      },
    )

    server.registerTool(
      'write_page',
      {
        title: 'Write page',
        description: 'Create or replace a page. The page is owned by your account.',
        inputSchema: {
          path: z.string().describe('Page path, e.g. "docs/intro".'),
          content: z.string().describe('The page body (usually HTML).'),
          contentType: z.string().optional().describe('MIME type. Defaults to text/html.'),
        },
      },
      async ({ path, content, contentType }) => {
        const key = toKey(path)
        if (isReservedKey(key)) {
          return { isError: true, content: [{ type: 'text', text: `Reserved path: ${key}` }] }
        }
        const existing = await this.env.BUCKET.head(key)
        if (existing && !this.owns(existing.customMetadata)) {
          return { isError: true, content: [{ type: 'text', text: `Forbidden: ${key} belongs to another account.` }] }
        }
        await this.env.BUCKET.put(key, content, {
          httpMetadata: { contentType: contentType || DEFAULT_CONTENT_TYPE },
          customMetadata: { owner: this.email },
        })
        return { content: [{ type: 'text', text: `Saved ${key} (${content.length} bytes), owner ${this.email}.` }] }
      },
    )

    server.registerTool(
      'delete_page',
      {
        title: 'Delete page',
        description: 'Delete a page you own.',
        inputSchema: { path: z.string().describe('Page path, e.g. "docs/intro".') },
      },
      async ({ path }) => {
        const key = toKey(path)
        const existing = await this.env.BUCKET.head(key)
        if (!existing) return { isError: true, content: [{ type: 'text', text: `Not found: ${key}` }] }
        if (!this.owns(existing.customMetadata)) {
          return { isError: true, content: [{ type: 'text', text: `Forbidden: ${key} belongs to another account.` }] }
        }
        await this.env.BUCKET.delete(key)
        return { content: [{ type: 'text', text: `Deleted ${key}.` }] }
      },
    )

    // --- Resources -----------------------------------------------------------
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
              'The URL path is the storage key. Reads are public; writes are authenticated. ' +
              `You are signed in as ${this.email}.`,
          },
        ],
      }),
    )

    server.registerResource(
      'pages',
      'pustak://pages',
      { title: 'Page catalogue', description: 'JSON index of all stored pages.', mimeType: 'application/json' },
      async (uri) => {
        const pages: { key: string; size: number; owner: string }[] = []
        let cursor: string | undefined
        do {
          const listing = await this.env.BUCKET.list({ cursor, include: ['customMetadata'] })
          for (const o of listing.objects) {
            pages.push({ key: o.key, size: o.size, owner: o.customMetadata?.owner || this.env.OWNER_EMAIL })
          }
          cursor = listing.truncated ? listing.cursor : undefined
        } while (cursor)
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ count: pages.length, pages }, null, 2) }] }
      },
    )

    server.registerResource(
      'page',
      new ResourceTemplate('pustak://page/{+path}', { list: undefined }),
      { title: 'Page', description: 'The stored content of a single page.' },
      async (uri, { path }) => {
        const key = toKey(Array.isArray(path) ? path.join('/') : String(path))
        const obj = await this.env.BUCKET.get(key)
        if (!obj) return { contents: [{ uri: uri.href, text: `Not found: ${key}` }] }
        return {
          contents: [{ uri: uri.href, mimeType: obj.httpMetadata?.contentType || DEFAULT_CONTENT_TYPE, text: await obj.text() }],
        }
      },
    )

    // --- Prompt --------------------------------------------------------------
    // "explainer" — placeholder content (see src/explainer.ts to fill it in).
    server.registerPrompt(
      'explainer',
      { title: 'Explainer', description: 'Explainer prompt (content to be filled in).' },
      () => ({
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: EXPLAINER_PROMPT_TEXT || '(The explainer prompt has not been filled in yet.)' },
          },
        ],
      }),
    )
  }
}

/** Mirror of the reserved-path rule for MCP writes. */
function isReservedKey(key: string): boolean {
  const first = key.split('/')[0]
  return ['_browse', '_docs', '_openapi.json', '_list', '_login', 'authorize', 'login', 'token', 'register', 'api', '.well-known'].includes(first)
}
