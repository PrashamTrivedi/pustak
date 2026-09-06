import { THEME_BODY_CSS, THEME_FONTS, THEME_ROOT_CSS } from './theme'

const NOT_FOUND_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>पुस्तक · not found</title>
${THEME_FONTS}
<style>
${THEME_ROOT_CSS}
${THEME_BODY_CSS}
  body { display: flex; align-items: center; justify-content: center; padding: 2rem; }
  .card { max-width: 28rem; background: var(--paper-2); border: 1.5px solid var(--rule); border-radius: 4px; box-shadow: var(--shadow); padding: 2rem 1.6rem; text-align: center; }
  h1 { font-family: var(--display); font-weight: 400; font-size: 2.4rem; line-height: 1; margin: 0 0 .6rem; }
  h1 .bindu { color: var(--sindoor); }
  p { color: var(--ink-soft); margin: 0 0 1.1rem; }
  .latin { font-weight: 600; letter-spacing: .28em; text-transform: uppercase; font-size: .62rem; color: var(--haldi); margin: 0 0 1rem; }
</style>
</head>
<body>
  <div class="card">
    <p class="latin">Pustak</p>
    <h1 lang="hi">पुस्तक<span class="bindu">।</span></h1>
    <p>A store for standalone pages, served from the edge. Nothing lives at this address.</p>
    <p><a href="/_login">Create an account</a> to keep your own pages here.</p>
  </div>
</body>
</html>`

/** Branded 404. Never interpolate the requested path (or anything derived from it). */
export function notFoundHtml(): string {
  return NOT_FOUND_HTML
}

export function notFoundResponse(): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'no-store',
    },
  })
}
