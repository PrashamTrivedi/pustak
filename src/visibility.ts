// Three-state page visibility, stored on the R2 object as customMetadata.visibility.
// Absence (and any unrecognised value) is unlisted — that is the migration.
export type Visibility = 'public' | 'unlisted' | 'private'

export const VISIBILITIES = ['public', 'unlisted', 'private'] as const
export const DEFAULT_VISIBILITY: Visibility = 'unlisted'

export function isVisibility(value: unknown): value is Visibility {
  return value === 'public' || value === 'unlisted' || value === 'private'
}

/** Read stored visibility. Missing or unrecognised keys are unlisted. */
export function readVisibility(customMetadata?: Record<string, string> | undefined): Visibility {
  const raw = customMetadata?.visibility
  return isVisibility(raw) ? raw : DEFAULT_VISIBILITY
}

/** `X-Robots-Tag` value, or undefined when the page may be indexed. */
export function robotsHeaderFor(v: Visibility): string | undefined {
  if (v === 'public') return undefined
  return 'noindex, nofollow'
}

export type R2Like = {
  get(key: string): Promise<R2ObjectBody | null>
  head(key: string): Promise<R2Object | null>
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: R2PutOptions,
  ): Promise<R2Object>
}

/**
 * Visibility for a create/replace write. An explicit value always wins.
 * If the caller omitted it, keep the existing object's state; only brand-new
 * keys get DEFAULT_VISIBILITY (unlisted).
 */
export async function visibilityForWrite(
  bucket: Pick<R2Like, 'head'>,
  key: string,
  stated: Visibility | undefined,
): Promise<Visibility> {
  if (stated) return stated
  const existing = await bucket.head(key)
  if (!existing) return DEFAULT_VISIBILITY
  return readVisibility(existing.customMetadata)
}

/**
 * Rewrite an object's visibility, preserving content type and every existing
 * customMetadata key (especially `owner`). R2 has no metadata-only update.
 */
export async function rewriteVisibility(
  bucket: R2Like,
  key: string,
  visibility: Visibility,
): Promise<'ok' | 'missing'> {
  const object = await bucket.get(key)
  if (!object) return 'missing'
  const body = await object.arrayBuffer()
  const customMetadata = { ...(object.customMetadata ?? {}), visibility }
  const contentType = object.httpMetadata?.contentType
  await bucket.put(key, body, {
    httpMetadata: contentType ? { contentType } : undefined,
    customMetadata,
  })
  return 'ok'
}
