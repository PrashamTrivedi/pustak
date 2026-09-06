// First-party HTML pages that are not stored in R2: /install, /learn, /why.
// /install and /learn are prompts — give the URL to an agent. /why is the essay.
import { injectOgIfMissing, socialImageUrl, socialMetaTags } from './meta'
import { THEME_BODY_CSS, THEME_FONTS, THEME_ROOT_CSS, esc } from './theme'
import {
  installPromptText,
  learnPromptText,
  mcpEndpoint,
  SITE_PAGE_SLUGS,
  type SitePageSlug,
} from './prompts'

export { SITE_PAGE_SLUGS, type SitePageSlug }

const PAGE_META: Record<SitePageSlug, { title: string; description: string }> = {
  install: {
    title: 'Install Pustak MCP',
    description: 'A prompt for your agent: add the Pustak MCP server and start publishing HTML pages.',
  },
  learn: {
    title: 'Learn something · Pustak',
    description: 'A prompt for your agent: find one thing you can learn for a quick advantage, then publish the explainer on Pustak.',
  },
  why: {
    title: 'Why this · Pustak',
    description: 'Why HTML beats a wall of markdown, what Thariq Shihipar showed, and why Pustak exists.',
  },
}

const PAGE_CSS = /* css */ `
  .top { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin: 0 0 2.2rem; }
  .mark { font-family: var(--display); font-size: 1.35rem; color: var(--ink); border-bottom: 0; font-weight: 400; }
  .mark:hover { color: var(--sindoor); border-bottom: 0; }
  .mark .bindu { color: var(--sindoor); }
  nav { display: flex; gap: .9rem; flex-wrap: wrap; font-weight: 600; font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; }
  nav a { border-bottom-color: transparent; color: var(--ink-soft); }
  nav a:hover, nav a[aria-current="page"] { color: var(--sindoor); border-bottom-color: var(--haldi); }
  .kicker { font-weight: 600; letter-spacing: .28em; text-transform: uppercase; font-size: .62rem; color: var(--haldi); margin: 0 0 .55rem; }
  h1 { font-family: var(--display); font-weight: 400; font-size: clamp(2.4rem, 8vw, 3.8rem); line-height: .95; margin: 0 0 1rem; }
  .lede { font-size: 1.18rem; color: var(--ink); margin: 0 0 1.4rem; }
  .actions { display: flex; gap: .55rem; flex-wrap: wrap; margin: 0 0 1.6rem; }
  .btn { cursor: pointer; border: 1.5px solid var(--sindoor-deep); background: var(--sindoor); color: #fdf2d8; border-radius: 3px; padding: .5rem 1rem; font-weight: 600; font-family: var(--text); font-size: .92rem; box-shadow: 0 2px 0 var(--sindoor-deep); text-decoration: none; display: inline-block; }
  a.btn { border-bottom: 0; padding-bottom: .5rem; color: #fdf2d8; }
  .btn:hover, a.btn:hover { background: var(--sindoor-deep); color: #fdf2d8; border-bottom: 0; }
  .btn.ghost, a.btn.ghost { background: transparent; color: var(--ink); border-color: var(--rule); box-shadow: 0 2px 0 var(--rule); }
  a.btn.ghost:hover, .btn.ghost:hover { background: var(--paper-2); color: var(--ink); }
  code { font-weight: 600; font-size: .88em; background: var(--paper-2); padding: .05em .35em; border-radius: 3px; }
  .leaf { background: var(--paper-2); border: 1.5px solid var(--rule); border-radius: 4px; box-shadow: var(--shadow); padding: 1.15rem 1.2rem; margin: 0 0 1.4rem; }
  .leaf pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace; font-size: .82rem; line-height: 1.55; color: var(--ink); }
  .prose p { margin: 0 0 1rem; color: var(--ink); }
  .prose h2 { font-family: var(--display); font-weight: 400; font-size: 1.7rem; margin: 1.8rem 0 .6rem; }
  .prose ul { margin: 0 0 1.1rem; padding: 0 0 0 1.15rem; }
  .prose li { margin: 0 0 .4rem; }
  .cta { display: grid; gap: .7rem; margin: 1.8rem 0 0; }
  .cta a.card { display: block; background: var(--paper-2); border: 1.5px solid var(--rule); border-radius: 4px; padding: .9rem 1rem; border-bottom: 1.5px solid var(--rule); box-shadow: var(--shadow); color: var(--ink); }
  .cta a.card:hover { border-color: var(--sindoor); color: var(--ink); }
  .cta a.card small { display: block; letter-spacing: .2em; text-transform: uppercase; font-size: .62rem; color: var(--haldi); margin-bottom: .25rem; }
  .cta a.card strong { font-family: var(--display); font-size: 1.35rem; font-weight: 400; }
  .note { font-size: .88rem; color: var(--ink-soft); margin: 0 0 1.1rem; }
  .toast { position: fixed; left: 50%; bottom: 1.4rem; transform: translateX(-50%) translateY(8px); background: var(--ink); color: #fdf2d8; font-size: .82rem; padding: .55rem 1rem; border-radius: 5px; opacity: 0; pointer-events: none; transition: opacity .2s ease, transform .2s ease; }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
`

function siteNav(current: SitePageSlug | 'home'): string {
  const link = (href: string, slug: string, label: string) =>
    `<a href="${href}"${current === slug ? ' aria-current="page"' : ''}>${label}</a>`
  return /* html */ `<div class="top">
    <a class="mark" href="/" lang="hi">पुस्तक<span class="bindu">।</span></a>
    <nav>
      ${link('/why', 'why', 'Why this')}
      ${link('/learn', 'learn', 'Learn')}
      ${link('/install', 'install', 'Install')}
      <a href="/_login">Sign in</a>
    </nav>
  </div>`
}

function copyScript(): string {
  return /* html */ `<div class="toast" id="toast" role="status"></div>
<script>
(function () {
  var t, toastEl = document.getElementById('toast');
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(t);
    t = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }
  function copy(text, label) {
    var done = function () { toast((label || 'Copied') + ''); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast('Copy failed'); });
    } else { toast('Copy failed'); }
  }
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () { copy(b.getAttribute('data-copy') || '', b.getAttribute('data-label') || 'Copied'); });
  });
})();
</script>`
}

function folio(opts: {
  origin: string
  slug: SitePageSlug
  body: string
}): string {
  const meta = PAGE_META[opts.slug]
  const origin = opts.origin.replace(/\/+$/, '')
  const url = origin + '/' + opts.slug
  const title = meta.title
  const description = meta.description
  const image = socialImageUrl(origin)
  const tags = socialMetaTags({ title, description, url, image })
  const html = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
${tags}
${THEME_FONTS}
<style>
${THEME_ROOT_CSS}
${THEME_BODY_CSS}
  .folio { max-width: 640px; margin: 0 auto; padding: clamp(1.4rem, 5vw, 3.2rem) 1.2rem 4rem; }
${PAGE_CSS}
</style>
</head>
<body>
  <div class="folio">
    ${siteNav(opts.slug)}
    ${opts.body}
  </div>
  ${copyScript()}
</body>
</html>`
  return injectOgIfMissing(html, { title, description, url, image })
}

export function installHtml(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  const prompt = installPromptText(base)
  const mcp = mcpEndpoint(base)
  const pageUrl = base + '/install'
  return folio({
    origin: base,
    slug: 'install',
    body: /* html */ `
    <p class="kicker">A prompt · for your agent</p>
    <h1>Install this MCP server.</h1>
    <p class="lede">Give this page to your agent. It will add Pustak as a remote MCP server, send you through sign-in, and then it can publish pages for you.</p>
    <p class="note">Humans can install it by hand too — the commands are in the prompt. Agents: the leaf below is your instruction.</p>
    <div class="actions">
      <button class="btn" type="button" data-copy="${esc(pageUrl)}" data-label="URL copied">Copy URL</button>
      <button class="btn ghost" type="button" data-copy="${esc(prompt)}" data-label="Prompt copied">Copy prompt</button>
      <a class="btn ghost" href="/why">Why this</a>
    </div>
    <div class="leaf"><pre>${esc(prompt)}</pre></div>
    <p class="note">Endpoint · <code>${esc(mcp)}</code></p>`,
  })
}

export function learnHtml(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  const prompt = learnPromptText(base)
  const pageUrl = base + '/learn'
  return folio({
    origin: base,
    slug: 'learn',
    body: /* html */ `
    <p class="kicker">A workflow · in a prompt</p>
    <h1>Find one thing I can use.</h1>
    <p class="lede">Paste this URL into any agent. It will pick something you can learn for a quick advantage, build an explainer, and then put the page on Pustak.</p>
    <p class="note">If the agent already has Pustak MCP tools, it publishes with <code>write_page</code>. If not, it will ask you to <a href="/_login">sign in</a> and upload the file — and point you at <a href="/install">install</a> for next time. We cannot see from here whether MCP is installed; the agent checks its own tools.</p>
    <div class="actions">
      <button class="btn" type="button" data-copy="${esc(pageUrl)}" data-label="URL copied">Copy URL</button>
      <button class="btn ghost" type="button" data-copy="${esc(prompt)}" data-label="Prompt copied">Copy prompt</button>
      <a class="btn ghost" href="/install">Install MCP</a>
    </div>
    <div class="leaf"><pre>${esc(prompt)}</pre></div>`,
  })
}

export function whyHtml(origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return folio({
    origin: base,
    slug: 'why',
    body: /* html */ `
    <p class="kicker">Why this</p>
    <h1>Markdown is what agents emit. HTML is what people actually read.</h1>
    <div class="prose">
      <p>As agents run longer, they dump more text. A fifty-line plan is fine. A thousand-line markdown spec is something you skim, then hand back to the model for another rewrite — without really inspecting it. The bottleneck is no longer whether the model can write. It is whether you stay in the loop.</p>
      <p><a href="https://thariqs.github.io/html-effectiveness/">Thariq Shihipar</a> (Claude Code) wrote this down as <em>the unreasonable effectiveness of HTML</em>. Instead of a wall of markdown, ask for a self-contained page: a side-by-side of three approaches, an annotated diff, a clickable flow, a concept you can poke. You review by looking, not by scrolling a terminal.</p>
      <p>Thariq's reason is staying in the loop. Markdown plans long enough to skim are plans you stop reading. HTML is how he stayed engaged with the agent's choices instead of handing them off.</p>
      <p>His <a href="https://thariqs.github.io/html-effectiveness/">example gallery</a> is the argument in working files — exploration, review, design, prototypes, decks, explainers, throwaway editors. You do not need a skill that wraps HTML in a template. You need to know you want a page, and then actually open it.</p>
      <h2>The leftover problem</h2>
      <p>The page is still a local file. It has no URL, no name, no way for the next agent (or a colleague) to find it. Hosting a site for every explainer is the thing you were trying not to do. Chat artifacts disappear. Gists and drive links are someone else's product, with someone else's login.</p>
      <h2>Why Pustak</h2>
      <p>Pustak is a store for those pages. One HTML file in, a URL out, served from the edge under your name. Public, unlisted, or private. An agent can write the next one over MCP — or you can upload from the dashboard if MCP is not installed yet.</p>
      <ul>
        <li><b>Store.</b> Keep the artifact. It is the deliverable, not a draft in a thread.</li>
        <li><b>Serve.</b> Anyone with the link (and the right visibility) can open it.</li>
        <li><b>Write.</b> The same agent that built the page can publish it.</li>
      </ul>
      <p>That is the whole service. Thariq showed the format. Pustak is a shelf for the files.</p>
    </div>
    <div class="cta">
      <a class="card" href="/learn">
        <small>Try it · no install required</small>
        <strong>Give an agent the learn prompt</strong>
      </a>
      <a class="card" href="/install">
        <small>Then · so the agent can publish</small>
        <strong>Install the MCP server</strong>
      </a>
    </div>`,
  })
}

export function sitePageHtml(slug: SitePageSlug, origin: string): string {
  if (slug === 'install') return installHtml(origin)
  if (slug === 'learn') return learnHtml(origin)
  return whyHtml(origin)
}
