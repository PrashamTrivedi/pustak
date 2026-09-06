import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EXPLAINER_PROMPT_TEXT } from './explainer'
import { isReservedSlug } from './users'
import {
  installPromptText,
  learnPromptText,
  mcpEndpoint,
  SITE_PAGE_SLUGS,
} from './prompts'
import { installHtml, learnHtml, whyHtml } from './site-pages'

const ORIGIN = 'https://pustak.example.test'

describe('reserved site-page slugs', () => {
  it('reserves install, why, and learn so they cannot be usernames', () => {
    for (const slug of SITE_PAGE_SLUGS) {
      assert.equal(isReservedSlug(slug), true, slug)
    }
  })
})

describe('explainer prompt', () => {
  it('does not prescribe a default CSS palette', () => {
    assert.equal(EXPLAINER_PROMPT_TEXT.includes('--bg:#0e1117'), false)
    assert.equal(EXPLAINER_PROMPT_TEXT.includes('--accent:#58a6ff'), false)
    assert.equal(/Design system \(reuse this/i.test(EXPLAINER_PROMPT_TEXT), false)
    assert.match(EXPLAINER_PROMPT_TEXT, /Visual design/)
    assert.match(EXPLAINER_PROMPT_TEXT, /stock palette/)
  })
})

describe('install prompt', () => {
  it('tells the agent to add the MCP endpoint', () => {
    const text = installPromptText(ORIGIN)
    assert.match(text, /Install Pustak MCP/)
    assert.equal(text.includes(mcpEndpoint(ORIGIN)), true)
    assert.match(text, /claude mcp add --transport http pustak/)
    assert.match(text, /whoami/)
  })
})

describe('learn prompt', () => {
  it('asks for a personal advantage explainer and a publish path', () => {
    const text = learnPromptText(ORIGIN)
    assert.match(text, /Based on what you know about me/)
    assert.match(text, /quick, concrete advantage/)
    assert.match(text, /write_page/)
    assert.equal(text.includes(ORIGIN + '/_login'), true)
    assert.equal(text.includes(ORIGIN + '/install'), true)
    assert.match(text, /Inspect your available tools/)
  })
})

describe('site pages', () => {
  it('install page embeds the prompt and copy actions', () => {
    const html = installHtml(ORIGIN)
    assert.match(html, /<title>Install Pustak MCP<\/title>/)
    assert.equal(html.includes(mcpEndpoint(ORIGIN)), true)
    assert.match(html, /data-copy/)
    assert.match(html, /Agents: the leaf below is your instruction/)
  })

  it('learn page explains the MCP-or-upload branch', () => {
    const html = learnHtml(ORIGIN)
    assert.match(html, /Find one thing I can use/)
    assert.match(html, /We cannot see from here whether MCP is installed/)
    assert.equal(html.includes('/_login'), true)
  })

  it('why page cites Thariq and explains the service', () => {
    const html = whyHtml(ORIGIN)
    assert.equal(html.includes('https://thariqs.github.io/html-effectiveness/'), true)
    assert.match(html, /Thariq Shihipar/)
    assert.match(html, /Why Pustak/)
    assert.match(html, /href="\/learn"/)
    assert.match(html, /href="\/install"/)
    assert.match(html, /staying in the loop/)
  })
})
