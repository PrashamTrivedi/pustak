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

  private get email(): string {
    return this.props?.email ?? 'unknown'
  }

  /** The caller's slug — their pages live under this R2 prefix. */
  private get username(): string {
    return this.props?.username ?? ''
  }

  /** Resolve a user-supplied, slug-relative path to a full R2 key under their slug. */
  private key(path: string): string {
    const rel = String(path).replace(/^\/+/, '').replace(new RegExp('^' + this.username + '/'), '')
    return toKey(this.username + '/' + rel)
  }

  /** Invariant: every valid token carries a slug. Guard tools against a blank one. */
  private get hasSlug(): boolean {
    return /^[a-z0-9-]+$/.test(this.username)
  }
  private noSlug() {
    return { isError: true, content: [{ type: 'text' as const, text: 'No username on this account — sign in again.' }] }
  }

  async init() {
    const { server } = this

    // --- Tools ---------------------------------------------------------------
    server.registerTool(
      'whoami',
      { title: 'Who am I', description: 'Return the authenticated Pustak account and its page space.' },
      async () => ({ content: [{ type: 'text', text: `You are ${this.email} (@${this.username}). Your pages live under /${this.username}/.` }] }),
    )

    server.registerTool(
      'list_pages',
      {
        title: 'List pages',
        description: 'List your stored pages, optionally filtered by a slug-relative prefix.',
        inputSchema: { prefix: z.string().optional().describe('Only paths starting with this (within your space).') },
      },
      async ({ prefix }) => {
        if (!this.hasSlug) return this.noSlug()
        const base = this.username + '/'
        const full = base + (prefix ? String(prefix).replace(/^\/+/, '') : '')
        const pages: { path: string; size: number; uploaded: string }[] = []
        let cursor: string | undefined
        do {
          const listing = await this.env.BUCKET.list({ prefix: full, cursor })
          for (const o of listing.objects) {
            pages.push({ path: o.key.slice(base.length), size: o.size, uploaded: o.uploaded.toISOString() })
          }
          cursor = listing.truncated ? listing.cursor : undefined
        } while (cursor)
        return { content: [{ type: 'text', text: JSON.stringify({ count: pages.length, username: this.username, pages }, null, 2) }] }
      },
    )

    server.registerTool(
      'read_page',
      {
        title: 'Read page',
        description: 'Return the content of one of your pages by its slug-relative path.',
        inputSchema: { path: z.string().describe('Slug-relative path, e.g. "explainers/intro".') },
      },
      async ({ path }) => {
        if (!this.hasSlug) return this.noSlug()
        const key = this.key(path)
        const obj = await this.env.BUCKET.get(key)
        if (!obj) return { isError: true, content: [{ type: 'text', text: `Not found: /${key}` }] }
        return { content: [{ type: 'text', text: await obj.text() }] }
      },
    )

    server.registerTool(
      'write_page',
      {
        title: 'Write page',
        description: 'Create or replace a page in your space. Served at /<username>/<path>.',
        inputSchema: {
          path: z.string().describe('Slug-relative path, e.g. "explainers/intro".'),
          content: z.string().describe('The page body (usually HTML).'),
          contentType: z.string().optional().describe('MIME type. Defaults to text/html.'),
        },
      },
      async ({ path, content, contentType }) => {
        if (!this.username) return { isError: true, content: [{ type: 'text', text: 'No username on this account.' }] }
        const key = this.key(path)
        await this.env.BUCKET.put(key, content, {
          httpMetadata: { contentType: contentType || DEFAULT_CONTENT_TYPE },
          customMetadata: { owner: this.email },
        })
        return { content: [{ type: 'text', text: `Saved /${key} (${content.length} bytes).` }] }
      },
    )

    server.registerTool(
      'delete_page',
      {
        title: 'Delete page',
        description: 'Delete one of your pages by its slug-relative path.',
        inputSchema: { path: z.string().describe('Slug-relative path, e.g. "explainers/intro".') },
      },
      async ({ path }) => {
        if (!this.hasSlug) return this.noSlug()
        const key = this.key(path)
        const existing = await this.env.BUCKET.head(key)
        if (!existing) return { isError: true, content: [{ type: 'text', text: `Not found: /${key}` }] }
        await this.env.BUCKET.delete(key)
        return { content: [{ type: 'text', text: `Deleted /${key}.` }] }
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
              'Each user\'s pages live under their username slug (/<username>/...). Reads are public; ' +
              `writes are authenticated. You are ${this.email} (@${this.username}).`,
          },
        ],
      }),
    )

    server.registerResource(
      'pages',
      'pustak://pages',
      { title: 'Your pages', description: 'JSON index of the pages in your space.', mimeType: 'application/json' },
      async (uri) => {
        const base = this.username + '/'
        const pages: { path: string; size: number }[] = []
        let cursor: string | undefined
        do {
          const listing = await this.env.BUCKET.list({ prefix: base, cursor })
          for (const o of listing.objects) pages.push({ path: o.key.slice(base.length), size: o.size })
          cursor = listing.truncated ? listing.cursor : undefined
        } while (cursor)
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ count: pages.length, username: this.username, pages }, null, 2) }] }
      },
    )

    server.registerResource(
      'page',
      new ResourceTemplate('pustak://page/{+path}', { list: undefined }),
      { title: 'Page', description: 'The content of one of your pages (slug-relative path).' },
      async (uri, { path }) => {
        const key = this.key(Array.isArray(path) ? path.join('/') : String(path))
        const obj = await this.env.BUCKET.get(key)
        if (!obj) return { contents: [{ uri: uri.href, text: `Not found: /${key}` }] }
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
