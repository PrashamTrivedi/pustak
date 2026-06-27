// Username slugs. Each user picks a unique slug on first login; it becomes the
// first path segment under which all their pages live (R2 keys `<slug>/...`).
// The slug is stored on the Better Auth `user` row (added in 0002_username.sql)
// and managed here directly via D1 (Better Auth doesn't need to know about it).
import type { Bindings } from './types'

// Top-level path segments the Worker owns — a slug may never collide with these.
const RESERVED_SLUGS = new Set([
  '_login', '_browse', '_docs', '_list', '_openapi.json', '_choose-username',
  'authorize', 'login', 'logout', 'token', 'register', 'api', 'mcp',
  '.well-known', 'favicon.ico', 'robots.txt', 'index.html', 'admin', 'static',
])

/** Slugs: 2–32 chars, lowercase alphanumeric + internal hyphens, no leading _. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(slug) && slug.length >= 2
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug)
}

/** Normalise a candidate into slug shape (used to suggest a default). */
export function slugifyEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const s = local.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)
  return s.length >= 2 ? s : 'user'
}

export async function getUsername(env: Bindings, userId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT username FROM user WHERE id = ?').bind(userId).first<{ username: string | null }>()
  return row?.username ?? null
}

export async function getUsernameByEmail(env: Bindings, email: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT username FROM user WHERE email = ?').bind(email).first<{ username: string | null }>()
  return row?.username ?? null
}

export async function isSlugTaken(env: Bindings, slug: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS x FROM user WHERE username = ?').bind(slug).first()
  return !!row
}

export type SetUsernameResult = 'ok' | 'invalid' | 'reserved' | 'taken'

/** Claim a slug for a user. Validates shape, reserved words, and uniqueness. */
export async function setUsername(env: Bindings, userId: string, slug: string): Promise<SetUsernameResult> {
  const s = slug.trim().toLowerCase()
  if (!isValidSlug(s)) return 'invalid'
  if (isReservedSlug(s)) return 'reserved'
  if (await isSlugTaken(env, s)) return 'taken'
  try {
    await env.DB.prepare('UPDATE user SET username = ? WHERE id = ?').bind(s, userId).run()
  } catch {
    // Unique-index race: someone claimed it between the check and the write.
    return 'taken'
  }
  return 'ok'
}
