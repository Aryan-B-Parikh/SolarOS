import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { listMaintenanceAlerts } from '@/services/maintenance'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireUser()
    return { alerts: await listMaintenanceAlerts() }
  })
}
