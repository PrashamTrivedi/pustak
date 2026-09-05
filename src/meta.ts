import { OG_IMAGE_PATH } from './theme'

export type SocialMeta = {
  title: string
  description: string
  url: string
  image: string
}

export function socialImageUrl(origin: string): string {
  return origin.replace(/\/+$/, '') + OG_IMAGE_PATH
}

/** Open Graph + Twitter tags. All present in the delivered HTML — crawlers do not run scripts. */
export function socialMetaTags(meta: SocialMeta): string {
  const t = escapeAttr(meta.title)
  const d = escapeAttr(meta.description)
  const u = escapeAttr(meta.url)
  const i = escapeAttr(meta.image)
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${i}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${i}" />`,
  ].join('\n')
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function htmlHasOgTitle(html: string): boolean {
  return /(?:property|name)\s*=\s*["']og:title["']/i.test(html)
}

/** Inject generated tags only when the document declares none of its own. */
export function injectOgIfMissing(html: string, meta: SocialMeta): string {
  if (htmlHasOgTitle(html)) return html
  const block = socialMetaTags(meta)
  const head = html.toLowerCase().indexOf('</head>')
  if (head === -1) return html
  return html.slice(0, head) + block + html.slice(head)
}
