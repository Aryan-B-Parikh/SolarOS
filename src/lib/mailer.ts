// Real email sending via the Resend HTTP API (D15). The outbox sender calls
// sendEmail() once per due message; everything here is provider-specific and
// kept out of the outbox domain logic.

import { AppError } from '@/lib/errors'

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
}

export function isMailerConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/** Send one email through Resend. Throws on any failure (caller retries). */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    throw new AppError('MAILER_DISABLED', 'Email provider not configured')
  }
  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    throw new Error(`Resend request failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  const bodyText = await res.text().catch(() => '')
  if (!res.ok) {
    const trimmed = bodyText.slice(0, 200)
    throw new Error(`Resend ${res.status}: ${trimmed}`)
  }
  let id = ''
  try {
    id = (JSON.parse(bodyText) as { id?: string }).id ?? ''
  } catch {
    id = ''
  }
  return { messageId: id }
}
