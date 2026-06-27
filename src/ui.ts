// Built-in pages served from reserved routes. Kept out of index.ts so the Worker
// logic stays readable. The Swagger page is intended to be temporary.

/** Escape a value for safe interpolation into HTML/JS attribute or text. */
function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/**
 * The signed-in dashboard: lists / views / uploads / deletes the user's own
 * pages (scoped to their slug) using the browser session — no API token.
 */
export function dashboardHtml(username: string, email: string): string {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>पुस्तक · Pustak</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Rozha+One&family=Mukta:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --paper: #e7d3a0;
    --paper-2: #efe1bf;
    --paper-edge: #ddc795;
    --ink: #2d1f08;
    --ink-soft: #6b5524;
    --ink-faint: #927a45;
    --sindoor: #b23018;
    --sindoor-deep: #8a210d;
    --haldi: #c4881a;
    --neel: #243a82;
    --rule: #c9ad72;
    --display: "Rozha One", Georgia, serif;
    --text: "Mukta", system-ui, sans-serif;
    --shadow: 0 1px 0 #fff7e3, 0 16px 34px -22px #4a330f;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  ::selection { background: var(--sindoor); color: #fdf3da; }
  body {
    margin: 0; color: var(--ink); background-color: var(--paper);
    font-family: var(--text); font-size: 16px; line-height: 1.6; font-weight: 400;
    background-image:
      radial-gradient(130% 90% at 50% -20%, #f0e1bd 0%, transparent 55%),
      radial-gradient(90% 60% at 0% 110%, #d8c08a 0%, transparent 60%);
    min-height: 100vh;
  }
  body::before {
    content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: .5; mix-blend-mode: multiply;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");
  }
  .folio {
    position: relative; z-index: 1; max-width: 980px; margin: 0 auto;
    padding: clamp(1rem, 3vw, 2.4rem) clamp(.8rem, 4vw, 3rem) 4rem;
  }
  /* manuscript side margins */
  .folio::before, .folio::after {
    content: ""; position: absolute; top: 0; bottom: 0; width: 0;
    border-left: 1.5px solid var(--sindoor); box-shadow: 4px 0 0 -2.5px var(--sindoor);
    opacity: .5;
  }
  .folio::before { left: clamp(.4rem, 2vw, 1.4rem); }
  .folio::after  { right: clamp(.4rem, 2vw, 1.4rem); box-shadow: -4px 0 0 -2.5px var(--sindoor); }

  /* pothi binding rule with string-holes */
  .pothi-rule { display: flex; align-items: center; gap: 1rem; margin: .4rem 0 1.6rem; color: var(--sindoor); }
  .pothi-rule .line { flex: 1; height: 0; border-top: 1.5px solid var(--sindoor); box-shadow: 0 3px 0 -1.5px var(--sindoor); }
  .pothi-rule .hole { width: 13px; height: 13px; border: 1.5px solid var(--sindoor); border-radius: 50%; flex: none; }

  header { text-align: center; padding-bottom: .4rem; }
  .invocation { font-family: var(--display); font-size: 1.05rem; letter-spacing: .04em; color: var(--sindoor); margin: 0 0 .3rem; animation: rise .7s .05s both; }
  h1 { font-family: var(--display); font-weight: 400; font-size: clamp(4rem, 16vw, 8.5rem); line-height: .85; margin: 0; color: var(--ink); letter-spacing: -.01em; animation: rise .8s .1s both; }
  h1 .bindu { color: var(--sindoor); }
  .latin { font-family: var(--text); font-weight: 600; letter-spacing: .42em; text-transform: uppercase; font-size: .72rem; color: var(--haldi); margin: .55rem 0 0; padding-left: .42em; animation: rise .8s .18s both; }
  .colophon { max-width: 34rem; margin: 1rem auto 0; color: var(--ink-soft); font-size: 1.02rem; animation: rise .8s .26s both; }
  .colophon a { color: var(--sindoor); font-weight: 600; text-decoration: none; border-bottom: 1.5px solid var(--haldi); padding-bottom: 1px; }
  .colophon a:hover { color: var(--sindoor-deep); border-color: var(--sindoor); }

  .ornament { display: block; margin: 1.6rem auto 2rem; color: var(--sindoor); animation: rise .9s .34s both; }

  /* folio cards */
  .desk { display: grid; gap: 1.1rem; margin-bottom: 2rem; animation: rise .9s .4s both; }
  .card { position: relative; background: var(--paper-2); border: 1.5px solid var(--rule); border-radius: 4px; box-shadow: var(--shadow); padding: 1.4rem 1.4rem 1.2rem; }
  .card-label { font-family: var(--display); font-size: 1.15rem; color: var(--sindoor); margin: 0 0 .15rem; }
  .card-label small { font-family: var(--text); font-weight: 600; font-size: .62rem; letter-spacing: .28em; text-transform: uppercase; color: var(--ink-faint); margin-left: .55rem; vertical-align: middle; }

  label.field { display: flex; align-items: center; gap: .6rem; flex: 1; min-width: 14rem; border-bottom: 1.5px solid var(--ink); padding: .25rem .1rem; }
  label.field .tilak { color: var(--sindoor); font-size: 1.1rem; line-height: 1; }
  input, textarea, button { font-family: var(--text); font-size: 1rem; color: var(--ink); }
  input { background: transparent; border: 0; outline: 0; flex: 1; min-width: 0; padding: .35rem 0; }
  input::placeholder, textarea::placeholder { color: var(--ink-faint); }
  .bar { display: flex; gap: .7rem; align-items: center; flex-wrap: wrap; margin-top: .5rem; }

  button { cursor: pointer; border: 1.5px solid var(--sindoor-deep); background: var(--sindoor); color: #fdf2d8; border-radius: 3px; padding: .55rem 1.2rem; font-weight: 600; letter-spacing: .01em; box-shadow: 0 2px 0 var(--sindoor-deep); transition: transform .08s ease, box-shadow .08s ease, background .15s ease; }
  button:hover { background: var(--sindoor-deep); }
  button:active { transform: translateY(2px); box-shadow: 0 0 0 var(--sindoor-deep); }
  button.ghost { background: transparent; color: var(--ink); border-color: var(--rule); box-shadow: 0 2px 0 var(--rule); }
  button.ghost:hover { background: var(--paper); }
  .logout-btn { text-decoration: none; cursor: pointer; border: 1.5px solid var(--rule); background: transparent; color: var(--ink); border-radius: 3px; padding: .5rem 1.1rem; font-weight: 600; font-size: .9rem; box-shadow: 0 2px 0 var(--rule); white-space: nowrap; }
  .logout-btn:hover { background: var(--paper); color: var(--sindoor-deep); }

  #status { font-size: .82rem; color: var(--ink-soft); margin-top: .9rem; min-height: 1.2em; }
  #status::before { content: "॥ "; color: var(--haldi); }

  details { margin: 0; }
  details > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: .55rem; user-select: none; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary .om { color: var(--sindoor); font-family: var(--display); font-size: 1.4rem; line-height: 1; transition: transform .3s ease; }
  details[open] > summary .om { transform: rotate(45deg); }
  .up { display: grid; gap: .8rem; margin-top: 1.1rem; }
  .up .l { font-weight: 600; font-size: .64rem; letter-spacing: .22em; text-transform: uppercase; color: var(--ink-faint); display: block; margin-bottom: .3rem; }
  .up input[type=text] { border-bottom: 1.5px solid var(--rule); }
  .up input[type=file] { font-size: .85rem; }
  textarea { width: 100%; background: var(--paper); border: 1.5px solid var(--rule); border-radius: 3px; padding: .7rem; resize: vertical; font-size: .88rem; line-height: 1.55; }
  .row { display: flex; align-items: center; gap: .85rem; flex-wrap: wrap; }
  .hint { font-size: .82rem; color: var(--ink-faint); }
  code { font-family: var(--text); font-weight: 600; background: var(--haldi); color: #2d1f08; padding: .06em .4em; border-radius: 3px; }

  /* scribe — the new-page desk */
  .scribe-grid { display: grid; grid-template-columns: 1fr auto 1.05fr; gap: 1.2rem; align-items: stretch; }
  .scribe-meta { display: grid; gap: 1rem; align-content: start; }
  .field-block input { border-bottom: 1.5px solid var(--rule); }
  .drop { display: flex; align-items: center; gap: .8rem; cursor: pointer; padding: .85rem .9rem; border: 1.5px dashed var(--haldi); border-radius: 4px; background: var(--paper); transition: background .15s ease, border-color .15s ease; }
  .drop:hover { background: #c4881a18; }
  .drop.dragover { border-style: solid; border-color: var(--sindoor); background: #b2301814; }
  .drop .drop-ico { font-family: var(--display); font-size: 1.6rem; line-height: 1; color: var(--sindoor); }
  .drop .drop-txt { display: grid; line-height: 1.3; min-width: 0; }
  .drop .drop-txt b { font-weight: 600; font-size: .9rem; color: var(--ink); }
  .drop .drop-txt small { font-size: .74rem; color: var(--ink-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .scribe-or { display: grid; grid-template-rows: 1fr auto 1fr; justify-items: center; gap: .45rem; }
  .scribe-or::before, .scribe-or::after { content: ""; width: 1.5px; background: var(--rule); }
  .scribe-or span { font-family: var(--display); font-size: 1.15rem; color: var(--sindoor); text-align: center; line-height: 1; display: grid; gap: .1rem; }
  .scribe-or span small { font-family: var(--text); font-weight: 600; font-size: .56rem; letter-spacing: .2em; text-transform: uppercase; color: var(--ink-faint); }
  .scribe-body { display: flex; flex-direction: column; }
  .scribe-body textarea {
    flex: 1; min-height: 9.5rem; line-height: 1.7em; padding: .5rem .7rem .5rem 1.4rem; border: 1.5px solid var(--rule);
    background:
      repeating-linear-gradient(var(--paper) 0, var(--paper) calc(1.7em - 1px), #c9ad7255 calc(1.7em - 1px), #c9ad7255 1.7em) local;
    box-shadow: inset 2.5px 0 0 #b2301855;
  }
  .scribe-body textarea:focus { box-shadow: inset 2.5px 0 0 var(--sindoor); }
  .scribe-foot { margin-top: 1rem; padding-top: .9rem; border-top: 1px solid var(--rule); }
  @media (max-width: 640px) {
    .scribe-grid { grid-template-columns: 1fr; }
    .scribe-or { grid-template-rows: none; grid-auto-flow: column; align-items: center; }
    .scribe-or::before, .scribe-or::after { width: auto; height: 1.5px; align-self: center; }
    .scribe-or span { display: flex; gap: .4rem; align-items: baseline; }
  }

  /* the index */
  .index-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin: 2.4rem 0 .6rem; flex-wrap: wrap; }
  .index-head h2 { font-family: var(--display); font-weight: 400; font-size: clamp(1.9rem, 5vw, 2.8rem); margin: 0; color: var(--ink); }
  .index-head h2 .danda { color: var(--haldi); }
  .index-head h2 small { font-family: var(--text); font-weight: 600; font-size: .6rem; letter-spacing: .26em; text-transform: uppercase; color: var(--ink-faint); margin-left: .6rem; vertical-align: middle; }
  .count { font-family: var(--display); font-size: 1.2rem; color: #fdf2d8; background: var(--sindoor); border: 1.5px solid var(--sindoor-deep); border-radius: 4px; padding: .15rem .85rem; }
  .count small { font-family: var(--text); font-weight: 500; font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; margin-left: .4rem; opacity: .85; }

  table { width: 100%; border-collapse: collapse; }
  thead th { font-weight: 600; font-size: .6rem; letter-spacing: .2em; text-transform: uppercase; color: var(--ink-faint); text-align: left; padding: .55rem .65rem; border-bottom: 2px solid var(--sindoor); }
  thead th.num { text-align: right; }
  tbody tr { border-bottom: 1px solid var(--rule); animation: unfurl .5s both; animation-delay: calc(var(--i,0) * 50ms); }
  tbody tr:hover { background: linear-gradient(90deg, #c4881a26, transparent 82%); box-shadow: inset 3px 0 0 var(--sindoor); }
  td { padding: .72rem .65rem; vertical-align: middle; }
  td.idx { font-family: var(--display); font-size: 1.15rem; color: var(--sindoor); width: 2.6rem; text-align: center; }
  td.key { font-size: .98rem; }
  td.key .dir { color: var(--ink-faint); }
  td.key .name { color: var(--ink); font-weight: 600; }
  td.key a { color: inherit; text-decoration: none; }
  td.key a:hover .name { border-bottom: 2px solid var(--haldi); }
  .chip { font-weight: 600; font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; color: var(--haldi); border: 1.5px solid var(--haldi); border-radius: 3px; padding: .12rem .45rem; white-space: nowrap; }
  td.num { text-align: right; font-size: .85rem; font-variant-numeric: tabular-nums; color: var(--ink-soft); }
  td.date { font-size: .8rem; color: var(--ink-faint); white-space: nowrap; }
  td.act { text-align: right; }
  button.del { font-weight: 600; font-size: .66rem; letter-spacing: .1em; text-transform: uppercase; border: 1.5px solid transparent; box-shadow: none; background: transparent; color: var(--ink-faint); padding: .3rem .55rem; opacity: 0; }
  tr:hover button.del { opacity: 1; }
  button.del:hover { background: var(--sindoor); color: #fdf2d8; border-color: var(--sindoor-deep); box-shadow: none; transform: none; }

  .empty { margin-top: 1.4rem; padding: 3rem 1.5rem; text-align: center; color: var(--ink-faint); border: 1.5px dashed var(--rule); border-radius: 4px; }
  .empty .big { display: block; font-family: var(--display); font-size: 2rem; color: var(--ink-soft); margin-bottom: .3rem; }

  .micro { display: block; margin-top: .45rem; font-size: .76rem; color: var(--ink-faint); }
  .micro em { font-style: italic; color: var(--sindoor); font-weight: 600; }

  /* index toolbar */
  .toolbar { display: flex; gap: .8rem; align-items: center; flex-wrap: wrap; margin: .1rem 0 1rem; }
  .toolbar .search { display: flex; align-items: center; gap: .55rem; flex: 1; min-width: 12rem; border-bottom: 1.5px solid var(--rule); padding: .2rem .1rem; }
  .toolbar .search .ic { color: var(--haldi); font-family: var(--display); }
  .toolbar .search input { background: transparent; border: 0; outline: 0; flex: 1; min-width: 0; padding: .35rem 0; font-family: var(--text); font-size: .96rem; color: var(--ink); }
  .toolbar .search input::placeholder { color: var(--ink-faint); }
  .toolbar select { font-family: var(--text); font-size: .85rem; color: var(--ink); background: var(--paper-2); border: 1.5px solid var(--rule); border-radius: 3px; padding: .48rem .6rem; cursor: pointer; }
  .toolbar select:focus { outline: 0; border-color: var(--sindoor); }
  .noresult { text-align: center; color: var(--ink-faint); padding: 2.2rem 1rem; font-style: italic; }

  /* row mini actions */
  td.act { white-space: nowrap; }
  button.mini { font-family: var(--display); font-size: 1.05rem; line-height: 1; border: 1.5px solid transparent; box-shadow: none; background: transparent; color: var(--ink-faint); padding: .26rem .46rem; border-radius: 3px; opacity: 0; transition: opacity .15s ease, background .15s ease, color .15s ease, border-color .15s ease; }
  tr:hover button.mini, button.mini:focus-visible { opacity: 1; }
  button.mini:hover { transform: none; box-shadow: none; }
  button.mini.copy:hover { background: var(--haldi); color: #2d1f08; border-color: var(--haldi); }
  button.mini.del:hover { background: var(--sindoor); color: #fdf2d8; border-color: var(--sindoor-deep); }

  /* preview drawer */
  .viewer { position: fixed; inset: 0; z-index: 50; display: none; }
  .viewer.open { display: block; }
  .viewer-scrim { position: absolute; inset: 0; background: #1a120388; backdrop-filter: blur(2px); animation: vfade .2s both; cursor: zoom-out; }
  .viewer-card { position: absolute; top: 0; right: 0; bottom: 0; width: min(900px, 94vw); background: var(--paper-2); border-left: 1.5px solid var(--sindoor); box-shadow: -30px 0 60px -30px #2d1f08; display: flex; flex-direction: column; animation: slidein .28s cubic-bezier(.2,.8,.2,1) both; }
  .viewer-bar { display: flex; align-items: center; gap: .7rem; padding: .85rem 1.1rem; border-bottom: 1.5px solid var(--rule); }
  .viewer-key { font-weight: 600; font-size: .92rem; color: var(--ink); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .viewer-key .dir { color: var(--ink-faint); font-weight: 400; }
  .viewer-bar a.open { font-weight: 600; font-size: .76rem; letter-spacing: .03em; text-decoration: none; color: var(--sindoor); border: 1.5px solid var(--sindoor); border-radius: 3px; padding: .4rem .7rem; box-shadow: none; }
  .viewer-bar a.open:hover { background: var(--sindoor); color: #fdf2d8; }
  .viewer-bar button.x { font-size: .8rem; border: 1.5px solid var(--rule); background: var(--paper); color: var(--ink); box-shadow: none; padding: .4rem .7rem; }
  .viewer-bar button.x:hover { background: var(--paper); border-color: var(--sindoor); transform: none; }
  .viewer-frame { flex: 1; width: 100%; border: 0; background: #fff; }

  /* toast */
  .toast { position: fixed; left: 50%; bottom: 1.5rem; transform: translateX(-50%) translateY(1rem); background: var(--ink); color: #fdf2d8; font-size: .82rem; padding: .6rem 1.05rem; border-radius: 5px; box-shadow: 0 16px 34px -16px #000; opacity: 0; pointer-events: none; transition: opacity .2s ease, transform .2s ease; z-index: 60; max-width: 90vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  .toast b { color: var(--haldi); font-weight: 600; }

  @keyframes vfade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slidein { from { transform: translateX(100%); } to { transform: none; } }

  footer { margin-top: 2.6rem; text-align: center; }
  footer .pothi-rule { margin: 0 0 .8rem; }
  footer p { font-weight: 600; font-size: .62rem; letter-spacing: .22em; text-transform: uppercase; color: var(--ink-faint); margin: 0; }
  footer .om { font-family: var(--display); color: var(--sindoor); font-size: 1.3rem; }

  @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes unfurl { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  @media (max-width: 640px) {
    .folio::before, .folio::after { display: none; }
    td.date, thead th:nth-child(5) { display: none; }
  }
</style>
</head>
<body>
<div class="folio">
  <div class="pothi-rule"><span class="hole"></span><span class="line"></span><span class="hole"></span><span class="line"></span><span class="hole"></span></div>

  <header>
    <p class="invocation" lang="sa">॥ पृष्ठानां सङ्ग्रहः ॥</p>
    <h1 lang="hi">पुस्तक<span class="bindu">।</span></h1>
    <p class="latin">Pustak · pages, served from the edge</p>
    <p class="colophon" lang="hi">किनारे पर रखे आपके पृष्ठ — your folios, served from the edge. <a href="/_docs">विवरण · API spec ▸</a></p>
  </header>

  <svg class="ornament" width="120" height="34" viewBox="0 0 120 34" fill="none" aria-hidden="true">
    <path d="M60 4c-6 0-9 7-7 12 1-5 4-8 8-8 5 0 8 4 8 9 0-9-4-13-9-13Z" fill="currentColor"/>
    <circle cx="60" cy="26" r="3" fill="currentColor"/>
    <path d="M40 17c-7-1-13 4-13 11 2-4 6-6 10-5-4 1-6 4-6 8 6 1 12-4 12-11 0-1 0-2-3-3Z" fill="currentColor" opacity=".8"/>
    <path d="M80 17c7-1 13 4 13 11-2-4-6-6-10-5 4 1 6 4 6 8-6 1-12-4-12-11 0-1 0-2 3-3Z" fill="currentColor" opacity=".8"/>
    <circle cx="16" cy="17" r="2.5" fill="currentColor" opacity=".6"/>
    <circle cx="104" cy="17" r="2.5" fill="currentColor" opacity=".6"/>
  </svg>

  <div class="desk">
    <section class="card">
      <p class="card-label" lang="hi">प्रवेश<small>Signed in</small></p>
      <div class="bar">
        <span class="field" style="gap:.5rem"><span class="tilak">۰</span><strong>@${esc(username)}</strong><span class="micro" style="margin:0">${esc(email)}</span></span>
        <a href="/logout" id="logout" class="logout-btn">बाहर · Sign out</a>
        <span id="status"></span>
      </div>
    </section>

    <section class="card scribe">
      <details>
        <summary><span class="om">+</span> <span class="card-label" lang="hi" style="margin:0">नया पृष्ठ<small>New page · inscribe a folio</small></span></summary>
        <div class="up">
          <div class="scribe-grid">
            <div class="scribe-meta">
              <div class="field-block">
                <span class="l">कुंजी · Shelf mark</span>
                <input id="up-path" type="text" placeholder="explainers/intro · index.html" />
                <span class="micro">stored under your space — <code>explainers/intro</code> → <code>/${esc(username)}/explainers/intro</code></span>
              </div>
              <label class="drop" id="drop">
                <input id="up-file" type="file" accept=".html,.htm,text/html" hidden />
                <span class="drop-ico">❦</span>
                <span class="drop-txt"><b lang="hi">पत्र जोड़ें · attach a leaf</b><small id="drop-name">drop an .html file, or click to choose</small></span>
              </label>
            </div>
            <div class="scribe-or"><span lang="hi">अथवा<small>or</small></span></div>
            <div class="scribe-body">
              <span class="l">मूल पाठ · raw HTML</span>
              <textarea id="up-body" rows="7" spellcheck="false" placeholder="&lt;!doctype html&gt;…"></textarea>
            </div>
          </div>
          <div class="row scribe-foot">
            <button id="up-go" lang="hi">✶ चढ़ाएँ · Inscribe</button>
            <span class="hint">filed as <code>text/html</code> unless a leaf sets its own type</span>
          </div>
        </div>
      </details>
    </section>
  </div>

  <div class="index-head" id="index-head" hidden>
    <h2 lang="hi"><span class="danda">॥</span> अनुक्रमणिका <span class="danda">॥</span><small>The Index</small></h2>
    <span class="count" id="count"></span>
  </div>

  <div class="toolbar" id="toolbar" hidden>
    <label class="search"><span class="ic">❂</span><input id="q" type="search" placeholder="खोजें · filter by path" autocomplete="off" /></label>
    <select id="sort" aria-label="sort order">
      <option value="name">A–Z · path</option>
      <option value="-name">Z–A · path</option>
      <option value="-date">newest first</option>
      <option value="date">oldest first</option>
      <option value="-size">largest first</option>
      <option value="size">smallest first</option>
    </select>
  </div>

  <table id="tbl" hidden>
    <thead><tr><th class="num">क्रम</th><th>Page · पृष्ठ</th><th>Type</th><th class="num">Size</th><th>Updated</th><th></th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
  <div id="empty" class="empty" hidden><span class="big" lang="hi">रिक्त पुस्तक</span>no pages have been written yet.</div>

  <footer>
    <div class="pothi-rule"><span class="line"></span><span class="om">۰</span><span class="line"></span></div>
    <p lang="hi">पुस्तक · Cloudflare R2 · pustak-pages</p>
  </footer>
</div>

<div class="viewer" id="viewer">
  <div class="viewer-scrim" data-close></div>
  <div class="viewer-card">
    <div class="viewer-bar">
      <span class="viewer-key" id="v-key"></span>
      <a class="open" id="v-open" target="_blank" rel="noopener">खोलें ↗ · open</a>
      <button class="x" id="v-close" data-close aria-label="close">✕</button>
    </div>
    <iframe class="viewer-frame" id="v-frame" title="page preview"></iframe>
  </div>
</div>
<div class="toast" id="toast" role="status"></div>

<script>
const USERNAME = ${JSON.stringify(username)};
const $ = (s) => document.querySelector(s);
const statusEl = $('#status');
const deva = (n) => String(n).replace(/[0-9]/g, (d) => '०१२३४५६७८९'[d]);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n/1024).toFixed(1) + ' KB' : (n/1048576).toFixed(1) + ' MB';
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); } catch { return s; } };
const fmtType = (t) => { if (!t) return '—'; const m = /^[^/]+\\/([^;\\s]+)/.exec(t); return (m ? m[1] : t).slice(0, 14); };
function setStatus(msg, err) { statusEl.textContent = msg; statusEl.style.color = err ? 'var(--sindoor)' : ''; }

async function load() {
  setStatus('reading the index…');
  try {
    const res = await fetch('/_list', { credentials: 'same-origin' });
    if (res.status === 401) { location.href = '/_login'; return; }
    if (!res.ok) return setStatus('error ' + res.status, true);
    const data = await res.json();
    render(data.pages || []);
    setStatus(data.count + ' page' + (data.count === 1 ? '' : 's') + ' written');
  } catch (e) { setStatus('network error: ' + e.message, true); }
}

let allPages = [];
function render(pages) {
  allPages = pages;
  const empty = $('#empty'), head = $('#index-head'), tb = $('#toolbar');
  if (!pages.length) { $('#tbl').hidden = true; head.hidden = true; tb.hidden = true; empty.hidden = false; return; }
  empty.hidden = true; head.hidden = false; tb.hidden = false;
  const total = pages.reduce((s, p) => s + (p.size || 0), 0);
  $('#count').innerHTML = deva(pages.length) + '<small>पृष्ठ · ' + fmtSize(total) + '</small>';
  applyView();
}

function applyView() {
  const rows = $('#rows'), tbl = $('#tbl');
  const q = $('#q').value.trim().toLowerCase();
  const sort = $('#sort').value, dir = sort[0] === '-' ? -1 : 1, key = sort.replace('-', '');
  const view = allPages.filter((p) => !q || p.path.toLowerCase().includes(q));
  view.sort((a, b) => {
    if (key === 'size') return (a.size - b.size) * dir;
    if (key === 'date') return (new Date(a.uploaded) - new Date(b.uploaded)) * dir;
    return a.path.localeCompare(b.path) * dir;
  });
  tbl.hidden = false; rows.innerHTML = '';
  if (!view.length) { rows.innerHTML = '<tr><td colspan="6" class="noresult">no paths match “' + esc(q) + '”</td></tr>'; return; }
  view.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.style.setProperty('--i', i);
    const href = '/' + p.key.split('/').map(encodeURIComponent).join('/');
    const cut = p.path.lastIndexOf('/');
    const dirp = cut >= 0 ? esc(p.path.slice(0, cut + 1)) : '';
    const name = esc(cut >= 0 ? p.path.slice(cut + 1) : p.path);
    const ek = encodeURIComponent(p.key);
    tr.innerHTML =
      '<td class="idx">' + deva(i + 1) + '</td>' +
      '<td class="key"><a class="open" href="' + href + '" data-key="' + ek + '">' +
        '<span class="dir">' + dirp + '</span><span class="name">' + name + '</span></a></td>' +
      '<td><span class="chip" title="' + esc(p.contentType || '') + '">' + esc(fmtType(p.contentType)) + '</span></td>' +
      '<td class="num">' + fmtSize(p.size) + '</td>' +
      '<td class="date">' + fmtDate(p.uploaded) + '</td>' +
      '<td class="act">' +
        '<button class="mini copy" title="copy link" aria-label="copy link" data-href="' + href + '">⎘</button>' +
        '<button class="mini del" title="delete" aria-label="delete" data-key="' + ek + '">✕</button>' +
      '</td>';
    rows.appendChild(tr);
  });
  rows.querySelectorAll('a.open').forEach((a) =>
    a.addEventListener('click', (e) => { e.preventDefault(); openViewer(decodeURIComponent(a.dataset.key), a.getAttribute('href')); }));
  rows.querySelectorAll('button.copy').forEach((b) => b.addEventListener('click', () => copyLink(b.dataset.href)));
  rows.querySelectorAll('button.del').forEach((b) => b.addEventListener('click', () => del(decodeURIComponent(b.dataset.key))));
}

function openViewer(key, href) {
  const cut = key.lastIndexOf('/');
  $('#v-key').innerHTML = (cut >= 0 ? '<span class="dir">' + esc(key.slice(0, cut + 1)) + '</span>' : '') + esc(cut >= 0 ? key.slice(cut + 1) : key);
  $('#v-open').href = href;
  $('#v-frame').src = href;
  $('#viewer').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeViewer() {
  $('#viewer').classList.remove('open');
  $('#v-frame').src = 'about:blank';
  document.body.style.overflow = '';
}

let toastT;
function toast(html) {
  const t = $('#toast'); t.innerHTML = html; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400);
}
function copyLink(href) {
  const url = location.origin + href;
  const done = () => toast('link copied · <b>' + esc(url) + '</b>');
  const fallback = () => {
    const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('copy failed — ' + esc(url)); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, fallback);
  else fallback();
}

async function del(key) {
  if (!confirm('Delete "' + key + '" from the book?')) return;
  const href = '/' + key.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(href, { method: 'DELETE', credentials: 'same-origin' });
  if (res.ok) load(); else setStatus('delete failed: ' + res.status, true);
}

async function upload() {
  const path = $('#up-path').value.trim();
  if (!path) return setStatus('give the page a key.', true);
  const file = $('#up-file').files[0];
  let body, type;
  if (file) { body = file; type = file.type || 'text/html; charset=utf-8'; }
  else { body = $('#up-body').value; type = 'text/html; charset=utf-8'; }
  if (!body || (typeof body === 'string' && !body.trim())) return setStatus('nothing to upload.', true);
  const rel = path.replace(/^\\/+/, '').replace(new RegExp('^' + USERNAME + '/'), '');
  const href = '/' + [USERNAME].concat(rel.split('/')).map(encodeURIComponent).join('/');
  const res = await fetch(href, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': type }, body });
  if (res.ok) { $('#up-path').value = ''; $('#up-file').value = ''; $('#up-body').value = ''; resetDrop(); load(); }
  else setStatus('upload failed: ' + res.status, true);
}

// drop zone for "attach a leaf"
const drop = $('#drop'), fileInput = $('#up-file'), dropName = $('#drop-name');
const resetDrop = () => { dropName.textContent = 'drop an .html file, or click to choose'; };
fileInput.addEventListener('change', () => { dropName.textContent = fileInput.files[0] ? fileInput.files[0].name : ''; if (!fileInput.files[0]) resetDrop(); });
['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragover'); }));
['dragleave', 'dragend', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragover'); }));
drop.addEventListener('drop', (e) => { const dt = e.dataTransfer; if (dt && dt.files.length) { fileInput.files = dt.files; dropName.textContent = dt.files[0].name; } });

$('#up-go').addEventListener('click', upload);
$('#q').addEventListener('input', applyView);
$('#sort').addEventListener('change', applyView);
$('#viewer').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeViewer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#viewer').classList.contains('open')) closeViewer(); });
load();
</script>
</body>
</html>`
}

/** Swagger UI shell (loaded from CDN), pointed at /_openapi.json. Temporary. */
export const SWAGGER_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>पुस्तक · विवरण</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Rozha+One&family=Mukta:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
<style>
  :root { --paper:#e7d3a0; --ink:#2d1f08; --sindoor:#b23018; --haldi:#c4881a; --rule:#c9ad72; }
  body { margin: 0; background: var(--paper); }
  .swagger-ui .topbar { display: none; }
  .vivaran {
    padding: 1.7rem clamp(1rem,4vw,2.6rem) 1.3rem; text-align: center;
    border-bottom: 1.5px solid var(--sindoor); box-shadow: 0 3px 0 -1.5px var(--sindoor);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.16'/%3E%3C/svg%3E");
  }
  .vivaran .back { font-family: "Mukta", sans-serif; font-weight: 600; font-size: .66rem; letter-spacing: .24em; text-transform: uppercase; color: var(--sindoor); text-decoration: none; }
  .vivaran h1 { font-family: "Rozha One", serif; font-weight: 400; font-size: clamp(2.4rem,8vw,4.4rem); margin: .35rem 0 0; color: var(--ink); }
  .vivaran h1 .bindu { color: var(--sindoor); }
  .vivaran p { font-family: "Mukta", sans-serif; font-weight: 600; font-size: .66rem; letter-spacing: .22em; text-transform: uppercase; color: var(--haldi); margin: .45rem 0 0; }
  .swagger-ui, .swagger-ui .info .title, .swagger-ui .opblock-tag, .swagger-ui .info p { color: var(--ink); font-family: "Mukta", sans-serif; }
  .swagger-ui .info { margin: 1.6rem 0; }
  .swagger-ui .scheme-container { background: transparent; box-shadow: none; border-bottom: 1.5px solid var(--rule); }
  .swagger-ui .btn.authorize { border-color: var(--sindoor); color: var(--sindoor); }
  .swagger-ui .btn.authorize svg { fill: var(--sindoor); }
  body { background-image: radial-gradient(130% 70% at 50% 0%, #efe1bd 0%, transparent 55%); }
</style>
</head>
<body>
<div class="vivaran">
  <a class="back" href="/_browse">← पुस्तक पर लौटें · back to the book</a>
  <h1 lang="hi">विवरण<span class="bindu">।</span></h1>
  <p>OpenAPI 3.1 · operations</p>
</div>
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
        'Store and serve standalone HTML pages from R2. Each user\'s pages live under their ' +
        'username slug (/<username>/...). Reads are public; writes, deletes and listing use your ' +
        'signed-in browser session (same-origin cookie) and are scoped to your own slug.',
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token', description: 'Your Pustak browser session — sign in at /_login.' },
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
          security: [{ cookieAuth: [] }],
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
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: { 'text/html': { schema: { type: 'string' } }, 'application/octet-stream': {} },
          },
          responses: { '201': { description: 'Stored' }, '401': { description: 'Unauthorized' } },
        },
        delete: {
          summary: 'Delete a page',
          security: [{ cookieAuth: [] }],
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
          security: [{ cookieAuth: [] }],
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
