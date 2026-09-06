import { injectOgIfMissing, socialImageUrl, socialMetaTags } from './meta'
import { PROOF_PROFILE_SLUG, THEME_BODY_CSS, THEME_FONTS, THEME_ROOT_CSS } from './theme'

export function landingHtml(origin: string): string {
  const title = 'Pustak · pages, served from the edge'
  const description =
    'Write a page, keep the URL. Pustak stores standalone HTML, serves it from the edge, and lets an agent write it for you.'
  const url = origin.replace(/\/+$/, '') + '/'
  const image = socialImageUrl(origin)
  const tags = socialMetaTags({ title, description, url, image })
  const proof = `/${PROOF_PROFILE_SLUG}`

  const html = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
${tags}
${THEME_FONTS}
<style>
${THEME_ROOT_CSS}
${THEME_BODY_CSS}
  .folio { max-width: 640px; margin: 0 auto; padding: clamp(2rem, 6vw, 4.5rem) 1.2rem 4rem; }
  .invocation { font-family: var(--display); color: var(--sindoor); margin: 0 0 .3rem; }
  h1 { font-family: var(--display); font-weight: 400; font-size: clamp(3.4rem, 14vw, 6.5rem); line-height: .85; margin: 0; }
  h1 .bindu { color: var(--sindoor); }
  .latin { font-weight: 600; letter-spacing: .34em; text-transform: uppercase; font-size: .68rem; color: var(--haldi); margin: .6rem 0 1.4rem; }
  .problem { font-size: 1.25rem; color: var(--ink); margin: 0 0 1.6rem; }
  .beats { list-style: none; padding: 0; margin: 0 0 1.8rem; display: grid; gap: .7rem; }
  .beats li { background: var(--paper-2); border: 1.5px solid var(--rule); border-radius: 4px; padding: .85rem 1rem; box-shadow: var(--shadow); }
  .beats b { color: var(--sindoor); }
  .proof { display: block; background: var(--ink); color: #fdf2d8; padding: 1.15rem 1.2rem; border-radius: 4px; border-bottom: 0; margin: 0 0 1.8rem; box-shadow: var(--shadow); }
  .proof:hover { color: #fdf2d8; border-bottom: 0; }
  .proof small { display: block; letter-spacing: .2em; text-transform: uppercase; font-size: .62rem; color: var(--haldi); margin-bottom: .35rem; }
  .proof strong { font-family: var(--display); font-size: 1.5rem; font-weight: 400; }
  .second { color: var(--ink-soft); }
</style>
</head>
<body>
  <div class="folio">
    <p class="invocation" lang="sa">॥ पृष्ठानां सङ्ग्रहः ॥</p>
    <h1 lang="hi">पुस्तक<span class="bindu">।</span></h1>
    <p class="latin">Pustak</p>
    <p class="problem">You already have the page. You should not have to stand up a site just to share it.</p>
    <ol class="beats">
      <li><b>Store.</b> Keep standalone HTML under your name.</li>
      <li><b>Serve.</b> Each page is a URL, delivered from the edge.</li>
      <li><b>Write.</b> An agent can inscribe pages for you over MCP.</li>
    </ol>
    <a class="proof" href="${proof}">
      <small>Live proof · a real profile</small>
      <strong>@${PROOF_PROFILE_SLUG}</strong>
    </a>
    <p class="second">Then, if you want a space of your own, <a href="/_login">sign in or create an account</a>.</p>
    <p class="second"><a href="/why">Why this</a> · <a href="/learn">Try a prompt</a> · <a href="/install">Install MCP</a></p>
  </div>
</body>
</html>`
  return injectOgIfMissing(html, { title, description, url, image })
}
