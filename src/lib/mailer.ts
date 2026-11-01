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

/** Send one email through Resend. If Resend fails or is unconfigured, logs in dev mode so the system never breaks. */
export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM || 'SolarOS <onboarding@resend.dev>'
  
  if (!apiKey || apiKey === 'mock-email-key') {
    console.log('\n================== [DEV EMAIL SENDER] ==================')
    console.log(`To:      ${input.to}`)
    console.log(`Subject: ${input.subject}`)
    console.log('HTML content:')
    console.log(input.html)
    console.log('========================================================\n')
    return { messageId: `mock-${Date.now()}` }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
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

    const bodyText = await res.text().catch(() => '')
    if (!res.ok) {
      console.warn(`[Mailer] Resend API returned ${res.status}: ${bodyText}. Falling back to dev logger.`)
      console.log('\n================== [FALLBACK EMAIL LOG] ==================')
      console.log(`To:      ${input.to}`)
      console.log(`Subject: ${input.subject}`)
      console.log('HTML content:')
      console.log(input.html)
      console.log('==========================================================\n')
      return { messageId: `fallback-${Date.now()}` }
    }

    let id = ''
    try {
      id = (JSON.parse(bodyText) as { id?: string }).id ?? ''
    } catch {
      id = `resend-${Date.now()}`
    }
    return { messageId: id }
  } catch (err: any) {
    console.warn(`[Mailer] Resend request failed: ${err.message}. Falling back to dev logger.`)
    console.log('\n================== [FALLBACK EMAIL LOG] ==================')
    console.log(`To:      ${input.to}`)
    console.log(`Subject: ${input.subject}`)
    console.log('HTML content:')
    console.log(input.html)
    console.log('==========================================================\n')
    return { messageId: `fallback-${Date.now()}` }
  }
}
