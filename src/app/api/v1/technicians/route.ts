import { NextRequest } from 'next/server'
import { handler } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  return handler(req, async () => {
    await requireUser()
    const technicians = await db.technician.findMany({
      include: { user: { select: { id: true, name: true, email: true } }, leaves: true },
    })
    return { technicians: technicians.map((t) => ({
      id: t.id, userId: t.user.id, name: t.user.name, email: t.user.email, skills: t.skills.split(',').filter(Boolean),
      isCrewLead: t.isCrewLead, hourlyCostPaise: t.hourlyCostPaise, maxJobsPerDay: t.maxJobsPerDay,
      leaves: t.leaves.map((l) => ({ startsOn: l.startsOn, endsOn: l.endsOn, reason: l.reason })),
    })) }
  })
}
