// Pustak branding for *shared* pages. A small, dismissible corner mark is
// injected into served HTML so every shared page carries the Pustak identity
// and an invitation to sign in / create an account — without getting in the way
// of reading (fixed, low-profile, one-tap dismiss that is remembered locally).

/** The self-contained badge markup injected into served HTML pages. */
function brandingBadge(): string {
  return /* html */ `
<div id="pustak-mark" data-pustak-branding hidden>
  <a id="pustak-mark-home" href="/_browse" title="पुस्तक · Pustak">॥ पुस्तक ॥</a>
  <a id="pustak-mark-login" href="/_login">Sign in / Create account</a>
  <button id="pustak-mark-x" type="button" aria-label="Hide Pustak mark">×</button>
</div>
<style>
  #pustak-mark{position:fixed;right:14px;bottom:14px;z-index:2147483600;display:flex;align-items:center;
    gap:10px;padding:7px 12px;border-radius:999px;font-family:system-ui,"Mukta",sans-serif;font-size:13px;
    line-height:1;color:#2d1f08;background:rgba(239,225,191,.92);border:1.5px solid #c9ad72;
    box-shadow:0 8px 22px -14px rgba(74,51,15,.9);backdrop-filter:saturate(1.1) blur(2px);}
  #pustak-mark-home{font-family:Georgia,serif;color:#b23018;text-decoration:none;font-weight:400;letter-spacing:.02em;}
  #pustak-mark-login{color:#243a82;text-decoration:none;font-weight:600;border-left:1px solid #d8c08a;padding-left:10px;}
  #pustak-mark-login:hover{color:#8a210d;}
  #pustak-mark-x{all:unset;cursor:pointer;color:#927a45;font-size:16px;line-height:1;padding:0 2px;}
  #pustak-mark-x:hover{color:#b23018;}
  @media print{#pustak-mark{display:none !important;}}
</style>
<script>
(function(){
  try{
    var el=document.getElementById('pustak-mark');
    if(!el)return;
    if(localStorage.getItem('pustak-mark-hidden')==='1')return;
    el.hidden=false;
    document.getElementById('pustak-mark-x').addEventListener('click',function(){
      el.hidden=true;try{localStorage.setItem('pustak-mark-hidden','1');}catch(e){}
    });
  }catch(e){}
})();
</script>`
}

/**
 * Inject the branding badge into an HTML document string. Placed just before
 * </body> when present, otherwise appended. Only call this for text/html.
 */
export function injectBranding(html: string): string {
  if (html.includes('data-pustak-branding')) return html // never double-inject
  const badge = brandingBadge()
  const idx = html.toLowerCase().lastIndexOf('</body>')
  if (idx === -1) return html + badge
  return html.slice(0, idx) + badge + html.slice(idx)
}

/** True for content types we should brand (rendered HTML documents only). */
export function isHtmlContentType(contentType: string | undefined): boolean {
  return !!contentType && contentType.toLowerCase().includes('text/html')
}
