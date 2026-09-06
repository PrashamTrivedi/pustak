import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildProfileModel, type ListedObject, type ProfileModel } from './profile'

const user = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Alice',
  username: 'alice',
}

const objects: ListedObject[] = [
  { path: 'index.html', visibility: 'public' },
  { path: 'open.html', visibility: 'public' },
  { path: 'quiet.html', visibility: 'unlisted' },
  { path: 'secret.html', visibility: 'private' },
]

function contentFields(m: ProfileModel) {
  return {
    aboutHref: m.aboutHref,
    pages: m.pages,
    counts: m.counts,
  }
}

describe('buildProfileModel', () => {
  it('owner without preview lists all pages and populates counts', () => {
    const m = buildProfileModel(user, objects, {
      isOwner: true,
      asPublic: false,
      origin: 'https://example.com',
      signedIn: true,
    })
    assert.equal(m.effectiveOwner, true)
    assert.equal(m.pages.length, 4)
    assert.deepEqual(m.counts, { public: 2, unlisted: 1, private: 1 })
    assert.equal(m.aboutHref, '/alice/index.html?pustak-embed=1')
  })

  it('owner with as=public shows only public pages and no counts', () => {
    const m = buildProfileModel(user, objects, {
      isOwner: true,
      asPublic: true,
      origin: 'https://example.com',
      signedIn: true,
    })
    assert.equal(m.effectiveOwner, false)
    assert.equal(m.pages.length, 2)
    assert.equal(m.pages.every((p) => p.visibility === 'public'), true)
    assert.equal(m.counts, null)
    assert.ok(m.aboutHref)
  })

  it('stranger content matches owner public preview', () => {
    const ownerPreview = buildProfileModel(user, objects, {
      isOwner: true,
      asPublic: true,
      origin: 'https://example.com',
      signedIn: true,
    })
    const stranger = buildProfileModel(user, objects, {
      isOwner: false,
      asPublic: false,
      origin: 'https://example.com',
      signedIn: false,
    })
    assert.deepEqual(contentFields(stranger), contentFields(ownerPreview))
  })

  it('stranger with as=public matches stranger without the flag', () => {
    const stranger = buildProfileModel(user, objects, {
      isOwner: false,
      asPublic: false,
      origin: 'https://example.com',
      signedIn: false,
    })
    const strangerFlag = buildProfileModel(user, objects, {
      isOwner: false,
      asPublic: true,
      origin: 'https://example.com',
      signedIn: false,
    })
    assert.deepEqual(contentFields(stranger), contentFields(strangerFlag))
  })

  it('hides about frame when index.html is not public in preview', () => {
    const privateIndex: ListedObject[] = [
      { path: 'index.html', visibility: 'private' },
      { path: 'open.html', visibility: 'public' },
    ]
    const m = buildProfileModel(user, privateIndex, {
      isOwner: true,
      asPublic: true,
      origin: 'https://example.com',
      signedIn: true,
    })
    assert.equal(m.aboutHref, null)
    assert.equal(m.pages.length, 1)
    assert.equal(m.pages[0].path, 'open.html')
  })
})

describe('profileHtml', () => {
  it('does not leak hidden paths or accordion markup to strangers', async () => {
    const { profileHtml } = await import('./profile')
    const m = buildProfileModel(user, objects, {
      isOwner: false,
      asPublic: false,
      origin: 'https://example.com',
      signedIn: false,
    })
    const html = profileHtml(m)
    assert.equal(/<details|only you can see/i.test(html), false)
    assert.equal(html.includes('quiet.html'), false)
    assert.equal(html.includes('secret.html'), false)
  })

  it('includes owner navigation chrome only for the owner view', async () => {
    const { profileHtml } = await import('./profile')
    const owner = buildProfileModel(user, objects, {
      isOwner: true,
      asPublic: false,
      origin: 'https://example.com',
      signedIn: true,
    })
    const preview = buildProfileModel(user, objects, {
      isOwner: true,
      asPublic: true,
      origin: 'https://example.com',
      signedIn: true,
    })
    assert.ok(profileHtml(owner).includes('_browse'))
    assert.ok(profileHtml(owner).includes('?as=public'))
    assert.ok(profileHtml(preview).includes('as a visitor sees it'))
    assert.equal(profileHtml(preview).includes('_browse'), false)
    assert.equal(profileHtml(preview).includes('quiet.html'), false)
  })
})
