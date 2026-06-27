// OTP delivery via our own cfEmailSender Worker (https://mail.prashamhtrivedi.app),
// reached over a worker-to-worker service binding (env.EMAIL_SENDER) — no
// third-party email provider. cfEmailSender's POST /api/send takes an x-api-key
// and delivers through Cloudflare Email Service.
//
// If EMAIL_API_KEY is unset we fail CLOSED in production (throw) rather than
// silently leaking codes — only the explicit local-dev opt-in OTP_DEV_ECHO=1
// logs the code to the console instead of calling the binding.
import type { Bindings } from './types'

export async function sendOtpEmail(env: Bindings, to: string, code: string): Promise<void> {
  if (!env.EMAIL_API_KEY) {
    if (env.OTP_DEV_ECHO === '1') {
      console.log(`[pustak] DEV: OTP for ${to} is ${code} (OTP_DEV_ECHO=1; set EMAIL_API_KEY to send real email)`)
      return
    }
    // Fail closed: never report success without actually sending.
    throw new Error('EMAIL_API_KEY is not configured (and OTP_DEV_ECHO is not set)')
  }

  // The service binding routes straight to the cf-email-sender Worker; the host
  // in the URL is irrelevant (it dispatches on path), but we keep it readable.
  const res = await env.EMAIL_SENDER.fetch('https://mail.prashamhtrivedi.app/api/send', {
    method: 'POST',
    headers: {
      'x-api-key': env.EMAIL_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.OTP_FROM_EMAIL,
      to: [to],
      subject: `${code} is your Pustak login code`,
      text: `Your Pustak login code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
      html: otpEmailHtml(code),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`cfEmailSender send failed: ${res.status} ${detail}`)
  }
}

function otpEmailHtml(code: string): string {
  return /* html */ `<!doctype html><html><body style="margin:0;background:#e7d3a0;font-family:'Mukta',system-ui,sans-serif;color:#2d1f08;padding:32px 0;">
  <div style="max-width:440px;margin:0 auto;background:#efe1bf;border:1.5px solid #c9ad72;border-radius:6px;padding:28px 32px;">
    <p style="font-family:Georgia,serif;color:#b23018;letter-spacing:.04em;margin:0 0 4px;">॥ पुस्तक ॥</p>
    <h1 style="font-family:Georgia,serif;font-weight:400;margin:0 0 16px;color:#2d1f08;">Pustak login</h1>
    <p style="margin:0 0 12px;">Use this one-time code to sign in:</p>
    <p style="font-size:34px;letter-spacing:.25em;font-weight:700;color:#8a210d;margin:8px 0 16px;">${code}</p>
    <p style="margin:0;color:#6b5524;font-size:14px;">It expires in 10 minutes. If you didn't request it, ignore this email.</p>
  </div>
</body></html>`
}
