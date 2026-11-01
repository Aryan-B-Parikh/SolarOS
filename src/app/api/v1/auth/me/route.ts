import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    const user = await getSessionUser()
    return { user }
  })
}
