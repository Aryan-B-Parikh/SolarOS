import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { listInstallations } from '@/services/installations'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireUser()
    return { installations: await listInstallations() }
  })
}
