import { NextRequest } from 'next/server'
import { handler, searchParams } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { warrantyCheck } from '@/services/tickets'

export async function GET(req: NextRequest) {
  const serial = searchParams(req).get('serial') ?? ''
  return handler(req, async () => {
    await requireCapability('tickets.read')
    return await warrantyCheck(serial)
  })
}
