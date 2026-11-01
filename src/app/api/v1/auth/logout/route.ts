import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { logout } from '@/lib/auth'

export async function POST(req: NextRequest) {
  return handler(req, async () => {
    await logout()
    return { ok: true }
  })
}
