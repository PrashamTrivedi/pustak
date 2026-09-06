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

export type ProfileCounts = {
  public: number
  unlisted: number
  private: number
}

export type ProfileModel = {
  user: PublicUser
  origin: string
  isOwner: boolean
  asPublic: boolean
  effectiveOwner: boolean
  signedIn: boolean
  aboutHref: string | null
  pages: ProfilePage[]
  counts: ProfileCounts | null
}

export type ListedObject = {
  path: string
  visibility: Visibility
}

const ABOUT_PATHS = ['index.html', 'about.html'] as const

function isAboutPath(path: string): boolean {
  return path === 'index.html' || path === 'about.html'
}

function resolveAboutHref(
  user: PublicUser,
  objects: ListedObject[],
  effectiveOwner: boolean,
): string | null {
  for (const path of ABOUT_PATHS) {
    const o = objects.find((x) => x.path === path)
    if (!o) continue
    if (effectiveOwner || o.visibility === 'public') {
      return `${pageHref(user.username, path)}?pustak-embed=1`
    }
  }
  return null
}

function pageHref(username: string, path: string): string {
  return '/' + [username, ...path.split('/')].map(encodeURIComponent).join('/')
}

/** Pure assembly from a walked listing — unit-testable without auth or R2. */
export function buildProfileModel(
  user: PublicUser,
  objects: ListedObject[],
  opts: { isOwner: boolean; asPublic: boolean; origin: string; signedIn: boolean },
): ProfileModel {
  const effectiveOwner = opts.isOwner && !opts.asPublic
  const listed: ProfilePage[] = []

  for (const o of objects) {
    if (!effectiveOwner && o.visibility !== 'public') continue
    listed.push({
      path: o.path,
      href: pageHref(user.username, o.path),
      visibility: o.visibility,
    })
  }

  let counts: ProfileCounts | null = null
  if (effectiveOwner) {
    counts = { public: 0, unlisted: 0, private: 0 }
    for (const o of objects) counts[o.visibility]++
  }

  const aboutHref = resolveAboutHref(user, objects, effectiveOwner)

  return {
    user,
    origin: opts.origin,
    isOwner: opts.isOwner,
    asPublic: opts.asPublic,
    effectiveOwner,
    signedIn: opts.signedIn,
    aboutHref,
    pages: listed.sort((a, b) => a.path.localeCompare(b.path)),
    counts,
  }
}

export async function loadProfile(
  env: Bindings,
  request: Request,
  slug: string,
): Promise<ProfileModel | null> {
  const user = await getUserByUsername(env, slug)
  if (!user) return null

  const url = new URL(request.url)
  const asPublic = url.searchParams.get('as') === 'public'
  const session = await getSessionUser(env, request)
  const isOwner = !!session && session.id === user.id
  const prefix = user.username + '/'
  const objects: ListedObject[] = []
  let cursor: string | undefined
  do {
    const listing = await env.BUCKET.list({ prefix, cursor, include: ['customMetadata'] })
    for (const o of listing.objects) {
      objects.push({
        path: o.key.slice(prefix.length),
        visibility: readVisibility(o.customMetadata),
      })
    }
    cursor = listing.truncated ? listing.cursor : undefined
  } while (cursor)

  return buildProfileModel(user, objects, {
    isOwner,
    asPublic,
    origin: url.origin,
    signedIn: !!session,
  })
}

function visibilityClass(v: Visibility): string {
  if (v === 'unlisted') return 'vis-quiet'
  if (v === 'private') return 'vis-secret'
  return 'vis-public'
}

export function profileHtml(model: ProfileModel): string {
  const display = model.user.name?.trim() || model.user.username
  const title = `${display} · Pustak`
  const description = `@${model.user.username} on Pustak — standalone pages, served from the edge.`
  const profileUrl = `${model.origin}/${encodeURIComponent(model.user.username)}`
  const tags = socialMetaTags({
    title,
    description,
    url: profileUrl,
    image: socialImageUrl(model.origin),
  })

  const canonical =
    model.isOwner && model.asPublic
      ? `<link rel="canonical" href="${esc(profileUrl)}" />`
      : ''

  const publicPages = model.pages.filter((p) => p.visibility === 'public' && !isAboutPath(p.path))
  const hiddenPages = model.effectiveOwner
    ? model.pages.filter((p) => p.visibility !== 'public' && !isAboutPath(p.path))
    : []

  const pageRow = (p: ProfilePage, mark?: string) =>
    `<li class="leaf ${visibilityClass(p.visibility)}"><a href="${esc(p.href)}">${esc(p.path)}</a>${
      mark ? `<span class="mark">${esc(mark)}</span>` : ''
    }</li>`

  const about = model.aboutHref
    ? `<section class="about">
        <h2>About</h2>
        <iframe title="About ${esc(display)}" src="${esc(model.aboutHref)}" sandbox="allow-scripts"></iframe>
      </section>`
    : ''

  const previewBanner =
    model.isOwner && model.asPublic
      ? `<p class="owner-banner preview-banner">You are viewing your profile as a visitor sees it. <a href="${esc(profileUrl)}">Back to owner view</a></p>`
      : ''

  const shareUrl = model.effectiveOwner
    ? `<div class="share-url">
        <label class="share-label" for="public-url">Public profile URL</label>
        <div class="share-row">
          <input id="public-url" type="text" readonly value="${esc(profileUrl)}" />
          <button type="button" class="copy-btn" data-copy-target="public-url" title="Copy URL" aria-label="Copy public profile URL">Copy</button>
        </div>
      </div>`
    : ''

  const countsStrip =
    model.effectiveOwner && model.counts
      ? `<div class="counts-strip" aria-label="Page visibility summary">
          <span class="count count-public"><strong>${model.counts.public}</strong> public</span>
          <span class="count count-sub"><strong>${model.counts.unlisted}</strong> unlisted</span>
          <span class="count count-sub"><strong>${model.counts.private}</strong> private</span>
        </div>`
      : ''

  const publicHeading = model.effectiveOwner
    ? `<h2 class="section-public">Public · anyone can see these</h2>`
    : `<h2>Pages</h2>`

  const publicSection = `${publicHeading}
    ${about}
    ${
      publicPages.length
        ? `<ul>${publicPages.map((p) => pageRow(p)).join('')}</ul>`
        : !model.aboutHref ? `<p class="empty">No public pages yet.</p>` : ''
    }`

  const hiddenSection =
    hiddenPages.length > 0
      ? `<details class="hidden-pages">
          <summary>Only you can see these — ${hiddenPages.length}</summary>
          <ul>${hiddenPages
            .map((p) => pageRow(p, p.visibility === 'private' ? 'Private' : 'Unlisted'))
            .join('')}</ul>
        </details>`
      : ''

  const ownerActions =
    model.isOwner && !model.asPublic
      ? `<nav class="profile-actions" aria-label="Profile navigation">
          <a href="/_browse">Back to dashboard</a>
          <a href="?as=public">See what a visitor sees</a>
        </nav>`
      : model.isOwner && model.asPublic
        ? ''
        : ''

  const cta = !model.signedIn
    ? `<p class="cta">Keep your own pages here. <a href="/_login">Sign in / create an account</a></p>`
    : ''

  const copyScript = model.effectiveOwner
    ? `<script>
document.querySelector('[data-copy-target]')?.addEventListener('click', () => {
  const el = document.getElementById('public-url');
  if (!el) return;
  const text = el.value;
  const done = () => { const b = document.querySelector('.copy-btn'); if (b) { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); } };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => { el.select(); document.execCommand('copy'); done(); });
  else { el.select(); document.execCommand('copy'); done(); }
});
</script>`
    : ''

  const html = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
${canonical}
${tags}
${THEME_FONTS}
<style>
${THEME_ROOT_CSS}
${THEME_BODY_CSS}
  .folio { max-width: 720px; margin: 0 auto; padding: clamp(1.4rem, 4vw, 3rem) 1.2rem 4rem; }
  .latin { font-weight: 600; letter-spacing: .28em; text-transform: uppercase; font-size: .62rem; color: var(--haldi); margin: 0 0 .4rem; }
  h1 { font-family: var(--display); font-weight: 400; font-size: clamp(2.2rem, 7vw, 3.4rem); line-height: 1; margin: 0; }
  .slug { color: var(--ink-soft); margin: .4rem 0 1.2rem; }
  .owner-banner { background: var(--paper-2); border: 1.5px solid var(--sindoor); color: var(--sindoor-deep); padding: .75rem 1rem; border-radius: 4px; margin-bottom: 1.2rem; }
  .owner-banner a { font-weight: 600; }
  .share-url { margin: 0 0 1.2rem; }
  .share-label { display: block; font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: .35rem; }
  .share-row { display: flex; gap: .5rem; align-items: stretch; }
  .share-row input { flex: 1; min-width: 0; font-family: var(--text); font-size: .88rem; padding: .5rem .65rem; border: 1.5px solid var(--rule); border-radius: 4px; background: var(--paper-2); color: var(--ink); }
  .copy-btn { cursor: pointer; border: 1.5px solid var(--sindoor-deep); background: var(--sindoor); color: #fdf2d8; border-radius: 3px; padding: .5rem .9rem; font-weight: 600; font-size: .82rem; white-space: nowrap; }
  .copy-btn:hover { background: var(--sindoor-deep); }
  .counts-strip { display: flex; gap: 1rem; flex-wrap: wrap; margin: 0 0 1.4rem; padding: .75rem 1rem; background: var(--paper-2); border: 1.5px solid var(--rule); border-radius: 4px; }
  .count { font-size: .88rem; color: var(--ink-soft); }
  .count strong { font-family: var(--display); font-size: 1.4rem; color: var(--sindoor); margin-right: .25rem; }
  .count-public strong { color: var(--sindoor); }
  .count-sub { font-size: .78rem; opacity: .85; }
  .about iframe { width: 100%; min-height: 22rem; border: 1.5px solid var(--rule); border-radius: 4px; background: #fff; }
  h2 { font-family: var(--display); font-weight: 400; font-size: 1.6rem; color: var(--sindoor); margin: 1.8rem 0 .6rem; }
  h2.section-public { font-size: 1.75rem; border-bottom: 2px solid var(--sindoor); padding-bottom: .35rem; }
  ul { list-style: none; padding: 0; margin: 0; }
  .leaf { display: flex; gap: .7rem; align-items: baseline; padding: .55rem 0; border-bottom: 1px solid var(--rule); }
  .leaf a { border-bottom: 0; }
  .leaf a:hover { border-bottom: 1.5px solid var(--haldi); }
  .mark { font-size: .68rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; padding: .12rem .45rem; border-radius: 3px; }
  .vis-quiet .mark { color: var(--ink); background: var(--haldi); }
  .vis-secret .mark { color: #fdf2d8; background: var(--sindoor); }
  .empty { color: var(--ink-faint); font-style: italic; }
  details.hidden-pages { margin-top: 1.6rem; border: 1.5px solid var(--rule); border-radius: 4px; background: var(--paper-2); }
  details.hidden-pages > summary { cursor: pointer; padding: .85rem 1rem; font-weight: 600; color: var(--ink-soft); list-style: none; }
  details.hidden-pages > summary::-webkit-details-marker { display: none; }
  details.hidden-pages > ul { padding: 0 1rem .85rem; }
  .profile-actions { display: flex; gap: 1.2rem; flex-wrap: wrap; margin-top: 2rem; padding-top: 1.2rem; border-top: 1px solid var(--rule); }
  .profile-actions a { font-weight: 600; color: var(--sindoor); }
  .cta { margin-top: 2rem; }
</style>
</head>
<body>
  <div class="folio">
    <p class="latin">Pustak · profile</p>
    <h1>${esc(display)}</h1>
    <p class="slug">@${esc(model.user.username)}</p>
    ${previewBanner}
    ${shareUrl}
    ${countsStrip}
    <section class="public-pages">${publicSection}</section>
    ${hiddenSection}
    ${ownerActions}
    ${cta}
  </div>
  ${copyScript}
</body>
</html>`
  return injectOgIfMissing(html, { title, description, url: profileUrl, image: socialImageUrl(model.origin) })
}
