// Shared Indic-pothi palette. One source for dashboard, landing, profile, and 404.

/** Escape a value for safe interpolation into HTML text or attributes. */
export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export const THEME_FONTS = /* html */ `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Rozha+One&family=Mukta:wght@300;400;500;600;700&display=swap" rel="stylesheet" />`

/** `:root` custom properties — the visual system. Do not copy these by hand. */
export const THEME_ROOT_CSS = /* css */ `
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
`

export const THEME_BODY_CSS = /* css */ `
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
  a { color: var(--sindoor); font-weight: 600; text-decoration: none; border-bottom: 1.5px solid var(--haldi); padding-bottom: 1px; }
  a:hover { color: var(--sindoor-deep); border-color: var(--sindoor); }
`

export const OG_IMAGE_PATH = '/_og.png'
export const PROOF_PROFILE_SLUG = 'prash-h-trivedi'
