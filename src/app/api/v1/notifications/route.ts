import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { notificationsFeed } from '@/services/analytics'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireUser()
    return { messages: await notificationsFeed() }
  })
}
