// Built-in admin pages served from reserved routes. Kept out of index.ts so the
// Worker logic stays readable. The Swagger page is intended to be temporary.

/** Bucket browser — lists pages via /_list, supports view / upload / delete. */
export const BROWSER_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pustak — pages</title>
<style>
  :root { color-scheme: light dark; --b: #d0d0d0; --muted: #777; --accent: #2563eb; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem clamp(1rem, 4vw, 4rem); }
  header { display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 1.5rem; }
  .sub { color: var(--muted); }
  .bar { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin: 1.25rem 0; }
  input, button, textarea { font: inherit; padding: .45rem .6rem; border: 1px solid var(--b); border-radius: 6px; background: transparent; color: inherit; }
  input[type=text], input[type=password] { min-width: 16rem; }
  button { cursor: pointer; }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  button.danger { color: #b91c1c; border-color: #b91c1c33; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid var(--b); }
  th { color: var(--muted); font-weight: 600; font-size: .85rem; text-transform: uppercase; letter-spacing: .03em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .muted { color: var(--muted); }
  .empty { padding: 2rem; text-align: center; color: var(--muted); }
  details { margin: 1rem 0; border: 1px solid var(--b); border-radius: 8px; padding: .5rem 1rem; }
  summary { cursor: pointer; font-weight: 600; }
  .up { display: grid; gap: .5rem; margin-top: .75rem; max-width: 40rem; }
  #status { min-height: 1.2em; }
  code { background: #8881; padding: .1em .35em; border-radius: 4px; }
</style>
</head>
<body>
<header>
  <h1>Pustak</h1>
  <span class="sub">stored pages · <a href="/_docs">API docs</a></span>
</header>

<div class="bar">
  <input id="token" type="password" placeholder="API token (Bearer)" autocomplete="off" />
  <button id="save" class="primary">Load</button>
  <span id="status" class="muted"></span>
</div>

<details>
  <summary>Upload a page</summary>
  <div class="up">
    <input id="up-path" type="text" placeholder="path, e.g. docs/intro or index.html" />
    <input id="up-file" type="file" accept=".html,.htm,text/html" />
    <textarea id="up-body" rows="5" placeholder="…or paste HTML here"></textarea>
    <div>
      <button id="up-go" class="primary">Upload</button>
      <span class="muted">stored as <code>text/html</code> unless a file sets its own type</span>
    </div>
  </div>
</details>

<table id="tbl" hidden>
  <thead><tr><th>Page</th><th>Type</th><th class="num">Size</th><th>Updated</th><th></th></tr></thead>
  <tbody id="rows"></tbody>
</table>
<div id="empty" class="empty" hidden>No pages stored yet.</div>

<script>
const $ = (s) => document.querySelector(s);
const tokenInput = $('#token'), statusEl = $('#status');
tokenInput.value = localStorage.getItem('pustak_token') || '';

const token = () => tokenInput.value.trim();
const auth = () => ({ Authorization: 'Bearer ' + token() });
const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n/1024).toFixed(1) + ' KB' : (n/1048576).toFixed(1) + ' MB';
const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s; } };
function setStatus(msg, err) { statusEl.textContent = msg; statusEl.style.color = err ? '#b91c1c' : ''; }

async function load() {
  if (!token()) return setStatus('Enter your API token, then Load.', true);
  localStorage.setItem('pustak_token', token());
  setStatus('Loading…');
  try {
    const res = await fetch('/_list', { headers: auth() });
    if (res.status === 401) return setStatus('Unauthorized — check the token.', true);
    if (!res.ok) return setStatus('Error ' + res.status, true);
    const data = await res.json();
    render(data.pages || []);
    setStatus(data.count + ' page' + (data.count === 1 ? '' : 's'));
  } catch (e) { setStatus('Network error: ' + e.message, true); }
}

function render(pages) {
  const tbl = $('#tbl'), empty = $('#empty'), rows = $('#rows');
  rows.innerHTML = '';
  if (!pages.length) { tbl.hidden = true; empty.hidden = false; return; }
  empty.hidden = true; tbl.hidden = false;
  pages.sort((a, b) => a.key.localeCompare(b.key));
  for (const p of pages) {
    const tr = document.createElement('tr');
    const href = '/' + p.key.split('/').map(encodeURIComponent).join('/');
    tr.innerHTML =
      '<td><a href="' + href + '" target="_blank" rel="noopener">' + p.key + '</a></td>' +
      '<td class="muted">' + (p.contentType || '—') + '</td>' +
      '<td class="num">' + fmtSize(p.size) + '</td>' +
      '<td class="muted">' + fmtDate(p.uploaded) + '</td>' +
      '<td><button class="danger" data-key="' + encodeURIComponent(p.key) + '">Delete</button></td>';
    rows.appendChild(tr);
  }
  rows.querySelectorAll('button.danger').forEach((b) =>
    b.addEventListener('click', () => del(decodeURIComponent(b.dataset.key))));
}

async function del(key) {
  if (!confirm('Delete "' + key + '"?')) return;
  const href = '/' + key.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(href, { method: 'DELETE', headers: auth() });
  if (res.ok) load(); else setStatus('Delete failed: ' + res.status, true);
}

async function upload() {
  const path = $('#up-path').value.trim();
  if (!path) return setStatus('Give the page a path.', true);
  const file = $('#up-file').files[0];
  let body, type;
  if (file) { body = file; type = file.type || 'text/html; charset=utf-8'; }
  else { body = $('#up-body').value; type = 'text/html; charset=utf-8'; }
  if (!body || (typeof body === 'string' && !body.trim())) return setStatus('Nothing to upload.', true);
  const href = '/' + path.replace(/^\\/+/, '').split('/').map(encodeURIComponent).join('/');
  const res = await fetch(href, { method: 'PUT', headers: { ...auth(), 'content-type': type }, body });
  if (res.ok) { $('#up-path').value = ''; $('#up-file').value = ''; $('#up-body').value = ''; load(); }
  else setStatus('Upload failed: ' + res.status, true);
}

$('#save').addEventListener('click', load);
$('#up-go').addEventListener('click', upload);
tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
if (token()) load();
</script>
</body>
</html>`

/** Swagger UI shell (loaded from CDN), pointed at /_openapi.json. Temporary. */
export const SWAGGER_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pustak API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
<style>body { margin: 0; } .topbar { display: none; }</style>
</head>
<body>
<div id="swagger"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>
window.ui = SwaggerUIBundle({
  url: '/_openapi.json',
  dom_id: '#swagger',
  deepLinking: true,
  persistAuthorization: true,
});
</script>
</body>
</html>`

/** OpenAPI 3.1 spec. `origin` makes "Try it out" target the right host. */
export function openApiSpec(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Pustak',
      version: '1.0.0',
      description:
        'Store and serve standalone HTML pages from R2. The URL path is the storage key. ' +
        'Reads are public; writes, deletes and listing require a Bearer token.',
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'The API_TOKEN secret.' },
      },
    },
    paths: {
      '/{path}': {
        parameters: [
          {
            name: 'path',
            in: 'path',
            required: true,
            description: 'Page path / storage key, e.g. "docs/intro". May contain slashes.',
            schema: { type: 'string' },
          },
        ],
        get: {
          summary: 'Serve a page',
          description: 'Returns the stored content with its original Content-Type. `/` and trailing `/` map to `index.html`.',
          responses: {
            '200': { description: 'Page content', content: { 'text/html': {} } },
            '404': { description: 'Not found' },
          },
        },
        put: {
          summary: 'Create or replace a page',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            description: 'Raw page content. Stored Content-Type mirrors the request (default text/html).',
            content: { 'text/html': { schema: { type: 'string' } }, 'application/octet-stream': {} },
          },
          responses: {
            '201': { description: 'Stored' },
            '400': { description: 'Empty body' },
            '401': { description: 'Missing/invalid token' },
            '403': { description: 'Reserved path' },
          },
        },
        post: {
          summary: 'Create or replace a page (alias of PUT)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'text/html': { schema: { type: 'string' } }, 'application/octet-stream': {} },
          },
          responses: { '201': { description: 'Stored' }, '401': { description: 'Unauthorized' } },
        },
        delete: {
          summary: 'Delete a page',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Deleted' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Reserved path' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/_list': {
        get: {
          summary: 'List stored pages',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'prefix', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by key prefix.' },
          ],
          responses: {
            '200': {
              description: 'Page listing',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      count: { type: 'integer' },
                      pages: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            key: { type: 'string' },
                            size: { type: 'integer' },
                            uploaded: { type: 'string', format: 'date-time' },
                            contentType: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
          },
        },
      },
    },
  }
}
