# Walkthrough — public-presence

## Setup

```bash
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply pustak-auth --local
npm run typecheck
npm run dev   # http://localhost:8787 (or 8788 if that port is taken)
```

Sign in at `/_login` (OTP is echoed in the wrangler log when `OTP_DEV_ECHO=1`).

```bash
BASE=http://localhost:8787
# export C as your session cookie: better-auth.session_token=...
USER=<your-slug>
```

## What to run

### Stranger (no cookie)

```bash
curl -sI "$BASE/"                    # 200 landing, not 302 /_login
curl -s  "$BASE/" | grep prash-h-trivedi
curl -s  "$BASE/robots.txt"
curl -sI "$BASE/_og.png"             # image/png
```

### Visibility loop

```bash
curl -X PUT "$BASE/$USER/probe.html" -H "cookie: $C" \
     -H 'content-type: text/html' --data '<h1>probe</h1>'
curl -s "$BASE/_list" -H "cookie: $C"   # visibility: unlisted

curl -si "$BASE/$USER/probe.html" | head -20   # 200 + noindex

curl -X PATCH "$BASE/$USER/probe.html" -H "cookie: $C" \
     -H 'content-type: application/json' --data '{"visibility":"private"}'
curl -s "$BASE/$USER/probe.html" > /tmp/a
curl -s "$BASE/$USER/definitely-never-existed.html" > /tmp/b
diff /tmp/a /tmp/b && echo identical
```

### Metadata preservation

```bash
curl -X PUT "$BASE/$USER/style.css" -H "cookie: $C" \
     -H 'content-type: text/css' --data 'body{color:red}'
curl -X PATCH "$BASE/$USER/style.css" -H "cookie: $C" \
     -H 'content-type: application/json' --data '{"visibility":"public"}'
curl -sI "$BASE/$USER/style.css" | grep -i content-type   # text/css
```

### Profile and landing

```bash
curl -s  "$BASE/$USER" | grep 'sandbox="allow-scripts"'
curl -sI "$BASE/$USER/"
curl -sI "$BASE/$USER/index.html"
curl -s  "$BASE/" | grep -o 'og:[a-z]*' | sort -u
```

Dashboard: each index row has Public / Unlisted / Private. Switching to Public asks for confirmation (anyone can open it, it appears on your profile, search engines may index it).

## After deploy

```bash
curl -sI -A 'LinkedInBot/1.0 (compatible; Mozilla/5.0)' \
  https://pustak.prashamhtrivedi.app/
```

If that is 200 with tags but LinkedIn’s composer still fails, check bot-fight / WAF for LinkedInBot on the zone — not this code.
