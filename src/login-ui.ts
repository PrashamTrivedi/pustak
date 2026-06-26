// Branded login screens shared by the OAuth /authorize flow and the standalone
// /_login page. Same Indic-pothi palette as the rest of Pustak.

type Step = 'email' | 'code' | 'done'

type LoginPageOpts = {
  step: Step
  /** Form POST target. */
  action: string
  /** Hidden inputs to carry through (e.g. the encoded OAuth request + email). */
  hidden?: Record<string, string>
  /** Pre-filled email (on the code step). */
  email?: string
  /** Error banner text. */
  error?: string
  /** Optional one-line context under the title (e.g. which app is connecting). */
  subtitle?: string
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function hiddenInputs(hidden: Record<string, string> = {}): string {
  return Object.entries(hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('')
}

const SHELL_HEAD = /* html */ `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>पुस्तक · प्रवेश · Pustak login</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Rozha+One&family=Mukta:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root{--paper:#e7d3a0;--paper-2:#efe1bf;--ink:#2d1f08;--ink-soft:#6b5524;--ink-faint:#927a45;
    --sindoor:#b23018;--sindoor-deep:#8a210d;--haldi:#c4881a;--neel:#243a82;--rule:#c9ad72;
    --display:"Rozha One",Georgia,serif;--text:"Mukta",system-ui,sans-serif;}
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;color:var(--ink);background-color:var(--paper);font-family:var(--text);
    display:flex;align-items:center;justify-content:center;padding:24px;
    background-image:radial-gradient(130% 90% at 50% -20%,#f0e1bd 0%,transparent 55%),
      radial-gradient(90% 60% at 0% 110%,#d8c08a 0%,transparent 60%);}
  .card{position:relative;width:100%;max-width:400px;background:var(--paper-2);border:1.5px solid var(--rule);
    border-radius:6px;box-shadow:0 1px 0 #fff7e3,0 22px 44px -26px #4a330f;padding:30px 30px 26px;}
  .invocation{font-family:var(--display);color:var(--sindoor);letter-spacing:.04em;margin:0 0 2px;font-size:1rem;}
  h1{font-family:var(--display);font-weight:400;font-size:2.6rem;line-height:1;margin:0;color:var(--ink);}
  h1 .bindu{color:var(--sindoor);}
  .latin{font-family:var(--text);font-weight:600;letter-spacing:.34em;text-transform:uppercase;font-size:.62rem;
    color:var(--haldi);margin:.5rem 0 0;}
  .subtitle{color:var(--ink-soft);font-size:.92rem;margin:.9rem 0 0;}
  .rule{display:flex;align-items:center;gap:.7rem;margin:1.2rem 0 1.1rem;color:var(--sindoor);}
  .rule .line{flex:1;height:0;border-top:1.5px solid var(--sindoor);box-shadow:0 3px 0 -1.5px var(--sindoor);opacity:.6;}
  .rule .hole{width:11px;height:11px;border:1.5px solid var(--sindoor);border-radius:50%;opacity:.6;}
  label{display:block;font-weight:600;font-size:.82rem;color:var(--ink-soft);margin:0 0 6px;}
  input[type=email],input[type=text]{width:100%;padding:11px 13px;font-family:var(--text);font-size:1rem;color:var(--ink);
    background:#fbf3dc;border:1.5px solid var(--rule);border-radius:5px;outline:none;}
  input:focus{border-color:var(--sindoor);box-shadow:0 0 0 3px rgba(178,48,24,.14);}
  input[name=code]{letter-spacing:.4em;font-size:1.3rem;text-align:center;font-weight:700;}
  button{margin-top:16px;width:100%;padding:12px;font-family:var(--text);font-weight:700;font-size:1rem;letter-spacing:.02em;
    color:#fdf3da;background:var(--sindoor);border:none;border-radius:5px;cursor:pointer;box-shadow:0 10px 22px -14px var(--sindoor-deep);}
  button:hover{background:var(--sindoor-deep);}
  .hint{color:var(--ink-faint);font-size:.8rem;margin:14px 0 0;}
  .hint a{color:var(--neel);text-decoration:none;font-weight:600;}
  .hint a:hover{color:var(--sindoor-deep);}
  .err{background:#f6dcc9;border:1.5px solid var(--sindoor);color:var(--sindoor-deep);border-radius:5px;
    padding:9px 12px;font-size:.86rem;margin:0 0 14px;}
  .ok{font-family:var(--display);color:var(--sindoor);font-size:1.3rem;margin:.4rem 0 0;}
</style>`

function header(subtitle?: string): string {
  return /* html */ `<p class="invocation" lang="sa">॥ प्रवेशः ॥</p>
  <h1 lang="hi">पुस्तक<span class="bindu">।</span></h1>
  <p class="latin">Pustak · sign in</p>
  ${subtitle ? `<p class="subtitle">${esc(subtitle)}</p>` : ''}
  <div class="rule"><span class="line"></span><span class="hole"></span><span class="line"></span></div>`
}

export function loginPage(o: LoginPageOpts): string {
  const err = o.error ? `<div class="err">${esc(o.error)}</div>` : ''
  let body: string

  if (o.step === 'email') {
    body = /* html */ `${err}
      <form method="POST" action="${esc(o.action)}" autocomplete="on">
        ${hiddenInputs(o.hidden)}
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" inputmode="email" placeholder="you@example.com"
          value="${esc(o.email ?? '')}" required autofocus />
        <button type="submit">Send me a code</button>
      </form>
      <p class="hint">New to Pustak? Entering your email creates your account — no password needed.</p>`
  } else if (o.step === 'code') {
    body = /* html */ `${err}
      <form method="POST" action="${esc(o.action)}" autocomplete="one-time-code">
        ${hiddenInputs(o.hidden)}
        <label for="code">Enter the 6-digit code sent to ${esc(o.email ?? 'your email')}</label>
        <input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6"
          placeholder="••••••" required autofocus />
        <button type="submit">Verify &amp; continue</button>
      </form>
      <p class="hint">Didn't get it? <a href="${esc(o.action.replace(/verify$/, 'start'))}">Start over</a>.</p>`
  } else {
    body = /* html */ `<p class="ok">॥ स्वागतम् ॥</p>
      <p class="subtitle">You're signed in${o.email ? ` as <strong>${esc(o.email)}</strong>` : ''}. You can close this tab and return to Pustak.</p>
      <p class="hint"><a href="/_browse">Open the bucket browser →</a></p>`
  }

  return /* html */ `<!doctype html><html lang="en"><head>${SHELL_HEAD}</head>
<body><main class="card">${header(o.subtitle)}${body}</main></body></html>`
}
