# Purpose

Make every Pustak link render a correct preview when it is pasted into LinkedIn
or X, and stop shared pages from previewing as broken.

## Original Ask

Spec 5 of `taskNotes/public-presence/taskFindings.md`. Contract:
`taskNotes/public-presence/requirements.md`, section 5. Origin: the CoS
acceptance test.

## Complexity and the reason behind it

**3 / 5.** Emitting the tags is simple. What raises this is the preview image,
which a Worker cannot generate without a dependency, and a documented external
blocker that may make the criterion fail for reasons this repository cannot fix.

## Architectural changes required

**Known external risk, read before starting.** Memory
`LinkedIn public face swapped 2026-09-05` records LinkedIn's preview fetcher
refusing four separate URLs, including pages on `prashamhtrivedi.in` that already
carry complete, correct Open Graph and Twitter tags and return 200 to a LinkedIn
user agent from outside. The metadata was not the problem. The suspected cause is
a Cloudflare bot-fight or WAF rule refusing LinkedInBot at the edge.

So this spec is judged on **emitting correct metadata in the delivered bytes**,
which is fully verifiable here. LinkedIn actually rendering the preview is a
zone-configuration check, listed in Validation, and its failure is not this
spec's failure.

**Preview image.** A Worker cannot rasterise an image without pulling in a
dependency, and LinkedIn does not accept SVG for `og:image`. Ship one static
Pustak-branded PNG, committed to the repository and served from a reserved path
with a long cache header. Per-page generated images are explicitly out of scope.

## Backend changes required

- New `src/meta.ts`: build the Open Graph and Twitter tag block from a title,
  description, canonical URL and the image URL; and inject that block into served
  user HTML **only when the document declares no `og:title` of its own**. A page
  that brought its own tags keeps them untouched.
- `src/landing.ts` and `src/profile.ts` emit their own tags directly. The profile
  describes that user; the landing describes Pustak.
- `src/pages.ts`: serve the static preview image from its reserved path, and add
  that path to the reserved list in `src/users.ts` so no slug can shadow it.

All tags must be present in the HTML as delivered. Crawlers do not run scripts,
so nothing may be added to the document by client-side code.

## Frontend changes required

None beyond the tag blocks themselves.

## Acceptance Criteria

1. The landing emits `og:title`, `og:description`, `og:url`, `og:image` and the
   Twitter card tags, in the delivered bytes.
2. Every profile does the same, describing that user.
3. A user page with no tags of its own receives generated ones.
4. A user page that declares its own `og:title` is left untouched.
5. The preview image is served with 200 and a raster content type.
6. No tag is injected by client-side script.

## Validation

```bash
npm run typecheck
curl -s "$BASE/"      | grep -o 'og:[a-z]*'  | sort -u
curl -s "$BASE/$USER" | grep -o 'og:[a-z]*'  | sort -u
curl -sI "$BASE/_og.png" | grep -i content-type       # expect image/png
# a page that brought its own tags keeps exactly those
curl -s "$BASE/$USER/has-own-tags.html" | grep -c 'og:title'   # expect 1
```

After deploy, and as a separate step, from outside Cloudflare:

```bash
curl -sI -A 'LinkedInBot/1.0 (compatible; Mozilla/5.0)' https://pustak.prashamhtrivedi.app/
```

A 200 with the tags intact means this spec is done. If LinkedIn's own composer
still refuses to preview, check bot-fight mode and WAF rules for LinkedInBot on
the `prashamhtrivedi.app` zone before changing any code here — prior evidence
points at the edge, not at the markup.
