// Crew allocation scorer (TRD 2.4). Hard constraints first, then:
// score = 0.40 skill fit + 0.25 proximity + 0.20 workload balance + 0.15 site continuity

export interface CrewCandidate {
  technicianId: string
  name: string
  skills: string[] // SURVEY, ONGRID, OFFGRID_BATTERY, ELECTRICAL_LEAD
  isCrewLead: boolean
  onLeave: boolean
  jobsOnDate: number
  weeklyHours: number
  distanceKm: number
  surveyedSite: boolean
}

export interface CrewSuggestionResult {
  technicianIds: string[]
  names: string[]
  score: number
  breakdown: { skill: number; proximity: number; workload: number; continuity: number; total: number }
  reasons: string[]
}

export function scoreCrews(
  candidates: CrewCandidate[],
  opts: {
    systemType: string // ON_GRID, OFF_GRID
    capacityKw: number
    weights: { skill: number; proximity: number; workload: number; continuity: number }
    crewSizeFor3kw?: number // default 2
  }
): CrewSuggestionResult[] {
  const crewSize = opts.crewSizeFor3kw ?? (opts.capacityKw >= 4 ? 3 : 2)
  const requiredSkill = opts.systemType === 'OFF_GRID' ? 'OFFGRID_BATTERY' : 'ONGRID'
  const maxJobs = 2

  // hard constraints
  const eligible = candidates.filter((c) => !c.onLeave && c.jobsOnDate < maxJobs)
  const leads = eligible.filter((c) => c.isCrewLead && c.skills.includes(requiredSkill))
  const members = eligible.filter((c) => !c.isCrewLead)

  const results: CrewSuggestionResult[] = []
  for (const lead of leads) {
    // pick members to fill the crew
    const rest = [lead, ...members.filter((m) => m.technicianId !== lead.technicianId)]
    const crew = rest.slice(0, crewSize)
    if (crew.length < crewSize) continue

    const skill = avg(crew.map((c) => (c.skills.includes(requiredSkill) ? 1 : c.isCrewLead ? 1 : 0.5)))
    const proximity = avg(crew.map((c) => 1 - Math.min(1, c.distanceKm / 50)))
    const workload = avg(crew.map((c) => 1 - Math.min(1, c.weeklyHours / 40)))
    const continuity = crew.some((c) => c.surveyedSite) ? 1 : 0
    const w = opts.weights
    const total = w.skill * skill + w.proximity * proximity + w.workload * workload + w.continuity * continuity

    const reasons: string[] = []
    reasons.push(`Crew lead ${lead.name} holds the ${requiredSkill === 'ONGRID' ? 'on-grid' : 'battery'} skill`)
    if (crew.some((c) => c.surveyedSite)) reasons.push('Contains the technician who surveyed this site')
    if (avg(crew.map((c) => c.distanceKm)) < 15) reasons.push('Close to the site')

    results.push({
      technicianIds: crew.map((c) => c.technicianId),
      names: crew.map((c) => c.name),
      score: Math.round(total * 1000) / 1000,
      breakdown: {
        skill: round2(w.skill * skill),
        proximity: round2(w.proximity * proximity),
        workload: round2(w.workload * workload),
        continuity: round2(w.continuity * continuity),
        total: round2(total),
      },
      reasons,
    })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 3)
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
function round2(n: number): number {
  return Math.round(n * 1000) / 1000
}
