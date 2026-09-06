import { injectOgIfMissing, socialImageUrl, socialMetaTags } from './meta'
import { THEME_BODY_CSS, THEME_FONTS, THEME_ROOT_CSS, esc } from './theme'
import { getSessionUser } from './session'
import { getUserByUsername, type PublicUser } from './users'
import { readVisibility, type Visibility } from './visibility'
import type { Bindings } from './types'

export type ProfilePage = {
  path: string
  href: string
  visibility: Visibility
}

export type ProfileModel = {
  user: PublicUser
  origin: string
  isOwner: boolean
  signedIn: boolean
  aboutHref: string | null
  pages: ProfilePage[]
}

export async function loadProfile(
  env: Bindings,
  request: Request,
  slug: string,
): Promise<ProfileModel | null> {
  const user = await getUserByUsername(env, slug)
  if (!user) return null

  const session = await getSessionUser(env, request)
  const isOwner = !!session && session.id === user.id
  const prefix = user.username + '/'
  const listed: ProfilePage[] = []
  let indexVisibility: Visibility | null = null
  let cursor: string | undefined
  do {
    const listing = await env.BUCKET.list({ prefix, cursor, include: ['customMetadata'] })
    for (const o of listing.objects) {
      const path = o.key.slice(prefix.length)
      const visibility = readVisibility(o.customMetadata)
      if (path === 'index.html') indexVisibility = visibility
      if (!isOwner && visibility !== 'public') continue
      listed.push({
        path,
        href: '/' + o.key.split('/').map(encodeURIComponent).join('/'),
        visibility,
      })
    }
    cursor = listing.truncated ? listing.cursor : undefined
  } while (cursor)

  const aboutOk = indexVisibility !== null && (isOwner || indexVisibility === 'public')
  return {
    user,
    origin: new URL(request.url).origin,
    isOwner,
    signedIn: !!session,
    aboutHref: aboutOk ? `/${encodeURIComponent(user.username)}/index.html?pustak-embed=1` : null,
    pages: listed.sort((a, b) => a.path.localeCompare(b.path)),
  }
}

export function profileHtml(model: ProfileModel): string {
  const display = model.user.name?.trim() || model.user.username
  const title = `${display} · Pustak`
  const description = `@${model.user.username} on Pustak — standalone pages, served from the edge.`
  const url = `${model.origin}/${encodeURIComponent(model.user.username)}`
  const tags = socialMetaTags({
    title,
    description,
    url,
    image: socialImageUrl(model.origin),
  })

  const publicPages = model.pages.filter((p) => p.visibility === 'public')
  const otherPages = model.isOwner ? model.pages.filter((p) => p.visibility !== 'public') : []

  const pageRow = (p: ProfilePage, mark?: string) =>
    `<li class="leaf vis-${esc(p.visibility)}"><a href="${esc(p.href)}">${esc(p.path)}</a>${
      mark ? `<span class="mark">${esc(mark)}</span>` : ''
    }</li>`

  const about = model.aboutHref
    ? `<section class="about">
        <h2>About</h2>
        <iframe title="About ${esc(display)}" src="${esc(model.aboutHref)}" sandbox="allow-scripts"></iframe>
      </section>`
    : ''

  const ownerBanner = model.isOwner
    ? `<p class="owner-banner">You are signed in as the owner. <strong>Public</strong> pages are what a stranger sees. Unlisted and private pages below are marked and hidden from everyone else.</p>`
    : ''

  const cta = !model.signedIn
    ? `<p class="cta">Keep your own pages here. <a href="/_login">Sign in / create an account</a></p>`
    : ''

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
  .folio { max-width: 720px; margin: 0 auto; padding: clamp(1.4rem, 4vw, 3rem) 1.2rem 4rem; }
  .latin { font-weight: 600; letter-spacing: .28em; text-transform: uppercase; font-size: .62rem; color: var(--haldi); margin: 0 0 .4rem; }
  h1 { font-family: var(--display); font-weight: 400; font-size: clamp(2.2rem, 7vw, 3.4rem); line-height: 1; margin: 0; }
  .slug { color: var(--ink-soft); margin: .4rem 0 1.2rem; }
  .owner-banner { background: var(--paper-2); border: 1.5px solid var(--sindoor); color: var(--sindoor-deep); padding: .75rem 1rem; border-radius: 4px; }
  .about iframe { width: 100%; min-height: 22rem; border: 1.5px solid var(--rule); border-radius: 4px; background: #fff; }
  h2 { font-family: var(--display); font-weight: 400; font-size: 1.6rem; color: var(--sindoor); margin: 1.8rem 0 .6rem; }
  ul { list-style: none; padding: 0; margin: 0; }
  .leaf { display: flex; gap: .7rem; align-items: baseline; padding: .55rem 0; border-bottom: 1px solid var(--rule); }
  .leaf a { border-bottom: 0; }
  .leaf a:hover { border-bottom: 1.5px solid var(--haldi); }
  .mark { font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: .12rem .45rem; border-radius: 3px; }
  .vis-unlisted .mark { color: var(--ink); background: var(--haldi); }
  .vis-private .mark { color: #fdf2d8; background: var(--sindoor); }
  .empty { color: var(--ink-faint); font-style: italic; }
  .cta { margin-top: 2rem; }
</style>
</head>
<body>
  <div class="folio">
    <p class="latin">Pustak · profile</p>
    <h1>${esc(display)}</h1>
    <p class="slug">@${esc(model.user.username)}</p>
    ${ownerBanner}
    ${about}
    <h2>Pages</h2>
    ${
      publicPages.length
        ? `<ul>${publicPages.map((p) => pageRow(p)).join('')}</ul>`
        : `<p class="empty">No public pages yet.</p>`
    }
    ${
      otherPages.length
        ? `<h2>Only you can see these</h2><ul>${otherPages
            .map((p) => pageRow(p, p.visibility === 'private' ? 'Private' : 'Unlisted'))
            .join('')}</ul>`
        : ''
    }
    ${cta}
  </div>
</body>
</html>`
  return injectOgIfMissing(html, { title, description, url, image: socialImageUrl(model.origin) })
}
