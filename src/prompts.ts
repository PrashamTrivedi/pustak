// Prompt bodies shared by the public HTML pages (/install, /learn) and the MCP
// prompts. Origin is interpolated so local wrangler and production stay accurate.

export const SITE_PAGE_SLUGS = ['install', 'why', 'learn'] as const
export type SitePageSlug = (typeof SITE_PAGE_SLUGS)[number]

export const PRODUCTION_ORIGIN = 'https://pustak.prashamhtrivedi.app'

export function canonicalOrigin(origin: string): string {
  return origin.replace(/\/+$/, '') || PRODUCTION_ORIGIN
}

export function mcpEndpoint(origin: string): string {
  return canonicalOrigin(origin) + '/mcp'
}

/** Agent instructions: add the Pustak MCP server to the current client. */
export function installPromptText(origin: string): string {
  const base = canonicalOrigin(origin)
  const mcp = mcpEndpoint(base)
  return `# Install Pustak MCP

You are installing the Pustak MCP server for this user.

Pustak stores standalone HTML pages and serves them from the edge. Once connected, you can list, read, write, delete, and set visibility of the user's pages, and you get the \`explainer\` and \`learn\` prompts.

## Endpoint

Streamable HTTP, OAuth 2.1 (passwordless email + OTP — no API token):

${mcp}

## What to do

1. Detect which product you are running in (Cursor, Claude Code, Claude Desktop, or another MCP client).
2. Add a remote MCP server named \`pustak\` pointing at the endpoint above.
3. Have the user complete the in-browser OAuth login. First-time users pick a username slug.
4. Call \`whoami\` to confirm. Tell them their pages live under \`/<username>/\`.

## Client-specific install

### Claude Code

\`\`\`
claude mcp add --transport http pustak ${mcp}
\`\`\`

### Cursor

Write this into \`.cursor/mcp.json\` (project) or the user's MCP config. If you can edit the file, do it; then ask them to reload MCP if the server does not appear.

\`\`\`json
{
  "mcpServers": {
    "pustak": {
      "type": "http",
      "url": "${mcp}"
    }
  }
}
\`\`\`

### Claude Desktop and other HTTP MCP clients

Same JSON shape (\`type: "http"\`, \`url\` as above) in that product's MCP config.

## After it works

Publish HTML artifacts with \`write_page\`. Use the \`explainer\` prompt to turn a concept into a page, or \`learn\` to find one sharp thing this person can use and publish it.

If you cannot add MCP config yourself, show the user ${base}/install and the commands above, then stop.`
}

/**
 * Agent instructions: invent a personal explainer, then publish it.
 *
 * MCP-installed or not is the agent's call: we cannot see the client's tool
 * list from the Worker. The prompt tells the model to inspect its own tools
 * and either `write_page` or send the user through login + dashboard upload.
 */
export function learnPromptText(origin: string): string {
  const base = canonicalOrigin(origin)
  return `# Learn something I can use

Based on what you know about me — my work, the files and tools in this session, recent conversation, interests, and any profile or memory you can see — find **one specific thing I can learn that would give me a quick, concrete advantage** in the next few days.

Not a generic lecture. A sharp, situated insight: a technique, a mental model, a tool trick, a concept I am adjacent to but not using. Name why it pays off *for me*.

Then create a self-contained interactive HTML explainer/artifact that teaches it. The artifact IS the deliverable — meant to be opened and used, not a wall of chat markdown.

## How to build the page

- One HTML file. Inline all CSS and JS. No CDNs, no webfonts that require a network.
- Design it for this topic. Do **not** use a stock "explainer" palette or a prescribed template look. Type, color, layout, and motion should come from the idea.
- Progressive sections, at least one thing the reader can operate (demo, slider, stepper, toggle), a named gotcha, a one-sentence recap.
- Verify it actually renders before you claim you are done.

## After the page exists — publish it (do not skip)

Inspect your available tools.

**If you have Pustak MCP tools** (\`whoami\`, \`write_page\`):
1. Call \`whoami\` if you need the username.
2. Save the page with \`write_page\` (a path like \`explainers/<short-slug>\`; unlisted is fine).
3. Give me the live URL.

**If you do not have those tools:**
1. Save the HTML file locally so I can download or copy it.
2. Ask me to sign in (or create an account) at ${base}/_login.
3. Then upload the file from the dashboard (New page) so it gets a URL under my name.
4. Point me at ${base}/install so next time you can publish it yourself.

An explainer that only lives in this chat is a draft. Finish by putting it on Pustak.`
}
