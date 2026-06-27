// Small shared helpers. (Previously these lived in store.ts, which held the
// hand-rolled OTP logic now replaced by Better Auth.)

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
}
