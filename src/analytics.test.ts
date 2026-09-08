import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  POSTHOG_PROXY_PREFIX,
  buildCapturePayload,
  isPiiPropertyKey,
  isPosthogAssetPath,
  mcpToolStatus,
  posthogOriginPath,
  posthogSnippet,
  stripProxyHeaders,
} from './analytics'
import { landingHtml } from './landing'
import { isReservedSlug } from './users'

const ORIGIN = 'https://pustak.example.test'
const KEY = 'phc_test_token'

describe('PostHog proxy paths', () => {
  it('strips the /e prefix before forwarding', () => {
    assert.equal(posthogOriginPath('/e'), '/')
    assert.equal(posthogOriginPath('/e/'), '/')
    assert.equal(posthogOriginPath('/e/static/array.js'), '/static/array.js')
    assert.equal(posthogOriginPath('/e/e/'), '/e/')
    assert.equal(posthogOriginPath('/e/i/v0/e/'), '/i/v0/e/')
    assert.equal(posthogOriginPath('/e/array/config'), '/array/config')
  })

  it('treats static and array paths as assets', () => {
    assert.equal(isPosthogAssetPath('/static/array.js'), true)
    assert.equal(isPosthogAssetPath('/array/flags'), true)
    assert.equal(isPosthogAssetPath('/e/'), false)
    assert.equal(isPosthogAssetPath('/i/v0/e/'), false)
  })
})

describe('proxy header stripping', () => {
  it('drops cookies, auth, and client IP headers', () => {
    const headers = stripProxyHeaders(
      new Headers({
        cookie: 'session=abc',
        authorization: 'Bearer secret',
        'cf-connecting-ip': '203.0.113.9',
        'x-forwarded-for': '203.0.113.9',
        'x-real-ip': '203.0.113.9',
        'true-client-ip': '203.0.113.9',
        'content-type': 'application/json',
      }),
    )
    assert.equal(headers.get('cookie'), null)
    assert.equal(headers.get('authorization'), null)
    assert.equal(headers.get('cf-connecting-ip'), null)
    assert.equal(headers.get('x-forwarded-for'), null)
    assert.equal(headers.get('x-real-ip'), null)
    assert.equal(headers.get('true-client-ip'), null)
    assert.equal(headers.get('content-type'), 'application/json')
  })
})

describe('capture payload', () => {
  it('sends only the user id and allow-listed properties', () => {
    const body = buildCapturePayload(KEY, 'mcp_tool', 'user_123', {
      tool: 'write_page',
      status: 'ok',
      ok: true,
      email: 'a@b.c',
      username: 'alice',
      path: '/alice/secret.html',
      $ip: '203.0.113.9',
    })
    assert.equal(body.distinct_id, 'user_123')
    assert.equal(body.event, 'mcp_tool')
    const props = body.properties as Record<string, unknown>
    assert.equal(props.tool, 'write_page')
    assert.equal(props.status, 'ok')
    assert.equal(props.ok, true)
    assert.equal(props.$geoip_disable, true)
    assert.equal(props.email, undefined)
    assert.equal(props.username, undefined)
    assert.equal(props.path, undefined)
    assert.equal(props.$ip, undefined)
    assert.equal(JSON.stringify(body).includes('a@b.c'), false)
    assert.equal(JSON.stringify(body).includes('alice'), false)
  })
})

describe('PII property keys', () => {
  it('strips identity fields but keeps geoip-disable and path-like names', () => {
    assert.equal(isPiiPropertyKey('$ip'), true)
    assert.equal(isPiiPropertyKey('$geoip_city_name'), true)
    assert.equal(isPiiPropertyKey('email'), true)
    assert.equal(isPiiPropertyKey('$email'), true)
    assert.equal(isPiiPropertyKey('$set'), true)
    assert.equal(isPiiPropertyKey('$geoip_disable'), false)
    assert.equal(isPiiPropertyKey('$pathname'), false)
    assert.equal(isPiiPropertyKey('tool'), false)
  })
})

describe('MCP tool status', () => {
  it('classifies error, confirm, cancel, and ok results', () => {
    assert.equal(mcpToolStatus({ isError: true, content: [] }), 'error')
    assert.equal(mcpToolStatus({ inputRequests: { overwrite: {} } }), 'confirm')
    assert.equal(mcpToolStatus({ content: [{ type: 'text', text: 'Cancelled — nothing was changed.' }] }), 'cancel')
    assert.equal(mcpToolStatus({ content: [{ type: 'text', text: 'Saved /x' }] }), 'ok')
  })
})

describe('landing snippet', () => {
  it('is omitted without a key and included with the first-party host when present', () => {
    const bare = landingHtml(ORIGIN)
    assert.equal(bare.includes('posthog.init'), false)
    assert.equal(bare.includes(POSTHOG_PROXY_PREFIX + '/static'), false)

    const html = landingHtml(ORIGIN, KEY)
    assert.equal(html.includes('posthog.init'), true)
    assert.equal(html.includes(KEY), true)
    assert.equal(html.includes(`${POSTHOG_PROXY_PREFIX}`), true)
    assert.equal(html.includes('api_host: "/e"'), true)
    assert.equal(html.includes('us.i.posthog.com'), false)
    assert.equal(html.includes('data-ph="landing_proof_clicked"'), true)
    assert.equal(html.includes('data-ph="landing_login_clicked"'), true)
    assert.equal(html.includes('data-ph="landing_why_clicked"'), true)
    assert.equal(html.includes('data-ph="landing_learn_clicked"'), true)
    assert.equal(html.includes('data-ph="landing_install_clicked"'), true)
    assert.equal(html.includes('$geoip_disable'), true)
  })

  it('points the snippet at the proxy, not PostHog ingest', () => {
    const snippet = posthogSnippet(KEY)
    assert.equal(snippet.includes('api_host: "/e"'), true)
    assert.equal(snippet.includes('https://us.posthog.com'), true)
    assert.equal(snippet.includes('pustak.example.test'), false)
  })
})

describe('reserved proxy slug', () => {
  it('reserves e so it cannot be a username', () => {
    assert.equal(isReservedSlug('e'), true)
  })
})

describe('wrangler config', () => {
  it('does not commit POSTHOG_KEY as a var', () => {
    const cfg = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
    assert.equal(cfg.includes('POSTHOG_KEY'), false)
  })
})
