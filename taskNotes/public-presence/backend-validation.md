# Backend validation — public-presence

Local Worker: `http://127.0.0.1:8788` with `.dev.vars` (`OTP_DEV_ECHO=1`).
Session: `probe@example.com` → slug `probe-user`.

## Static

- `npm run typecheck` — exit 0
- `npx wrangler deploy --dry-run` — bundle ok (4640.98 KiB)

## Anonymous

- `GET /` → 200 landing HTML, not a redirect. Proof link `/prash-h-trivedi` appears before `/_login`. No hire/freelance/consult copy.
- OG/Twitter tags present: `og:title`, `og:description`, `og:url`, `og:image`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`.
- `GET /robots.txt` → 200 text/plain, reserved paths Disallow.
- `GET /_og.png` → 200 `image/png`, long cache.
- Missing page 404: branded HTML, no path leak, `X-Robots-Tag: noindex, nofollow`.
- Unknown slug `GET /not-a-real-username` → 302 to trailing slash (unchanged).
- `GET /_browse` → 302 `/_login`.
- `GET /_openapi.json` → valid JSON, no “reads are public”.

## Visibility (cookie session)

- `PUT /probe-user/probe.html` with no visibility → `{"visibility":"unlisted"}`; `/_list` reports unlisted.
- Anonymous GET unlisted → 200 + `X-Robots-Tag: noindex, nofollow`.
- `PATCH` to private; anonymous body of private page **diff-identical** to a never-written path; same 404 headers (`content-type`, `cache-control`, `x-robots-tag`).
- Owner GET private → 200 + noindex.
- `PUT` `style.css` as `text/css`, `PATCH` to public → `Content-Type: text/css`, no robots header.
- Overwrite of a public/private page with no stated visibility keeps that state (`listed.html` stayed public, `probe.html` stayed private). A new page with no stated visibility is still unlisted. An explicit `?visibility=` on PUT still wins.
- Invalid visibility `banana` → 400. Cross-user PATCH → 403.

## Profile / embed / meta

- Anonymous `/probe-user`: one `sandbox="allow-scripts"` iframe, no `allow-same-origin`, public pages only, sign-in CTA.
- Owner view additionally lists `probe.html` under “Only you can see these” marked Private.
- `/probe-user/` and `/probe-user/index.html` still serve the page (200).
- `?pustak-embed=1` skips branding; without it, branding is injected.
- Fragment HTML without `<head>` still receives generated `og:title`; a page that already declares `og:title` keeps a single tag.

Logs: `/opt/cursor/artifacts/anon_validation.log`, `/opt/cursor/artifacts/auth_validation.log`.
