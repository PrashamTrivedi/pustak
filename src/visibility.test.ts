import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { notFoundHtml, notFoundResponse } from './notfound'
import {
  DEFAULT_VISIBILITY,
  readVisibility,
  robotsHeaderFor,
  visibilityForWrite,
} from './visibility'

describe('readVisibility', () => {
  it('treats a missing key as unlisted', () => {
    assert.equal(readVisibility(undefined), 'unlisted')
    assert.equal(readVisibility({}), 'unlisted')
    assert.equal(readVisibility({ owner: 'a@b.c' }), 'unlisted')
  })

  it('rejects unrecognised values as unlisted', () => {
    assert.equal(readVisibility({ visibility: 'secret' }), 'unlisted')
  })

  it('returns a stored public or private value', () => {
    assert.equal(readVisibility({ visibility: 'public' }), 'public')
    assert.equal(readVisibility({ visibility: 'private' }), 'private')
  })
})

describe('robotsHeaderFor', () => {
  it('noindexes unlisted and private, not public', () => {
    assert.equal(robotsHeaderFor('public'), undefined)
    assert.equal(robotsHeaderFor('unlisted'), 'noindex, nofollow')
    assert.equal(robotsHeaderFor('private'), 'noindex, nofollow')
  })
})

describe('visibilityForWrite', () => {
  const headOf = (meta: Record<string, string> | null) => ({
    head: async () => (meta ? { customMetadata: meta } : null),
  })

  it('uses an explicit visibility even when the object already exists', async () => {
    const vis = await visibilityForWrite(headOf({ visibility: 'public' }), 'u/p.html', 'unlisted')
    assert.equal(vis, 'unlisted')
  })

  it('keeps the existing visibility when the caller omits it', async () => {
    assert.equal(await visibilityForWrite(headOf({ visibility: 'public' }), 'u/p.html', undefined), 'public')
    assert.equal(await visibilityForWrite(headOf({ visibility: 'private' }), 'u/p.html', undefined), 'private')
  })

  it('defaults a new key to unlisted', async () => {
    assert.equal(await visibilityForWrite(headOf(null), 'u/new.html', undefined), DEFAULT_VISIBILITY)
  })
})

describe('notFoundResponse', () => {
  it('is identical across two calls and never echoes a path', async () => {
    const a = notFoundResponse()
    const b = notFoundResponse()
    const [bodyA, bodyB] = await Promise.all([a.text(), b.text()])
    assert.equal(bodyA, bodyB)
    assert.equal(bodyA, notFoundHtml())
    assert.equal(/probe|never-existed|index\.html|\.html/.test(bodyA), false)
    assert.equal(a.status, 404)
    assert.equal(a.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal(a.headers.get('cache-control'), 'no-store')
  })
})
