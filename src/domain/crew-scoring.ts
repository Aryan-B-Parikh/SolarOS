/**
 * SunPower Ops - Crew Allocation Scoring Engine (TRD 2.4 / Screen S10)
 *
 * Hard Constraints:
 * 1. Every crew member is free on the date (no approved leave, under max jobs per day = 2).
 * 2. Crew lead holds the required skill (battery skill for OFF_GRID systems).
 * 3. Crew size matches capacity (2 members for <= 3 kW, 3 members for 4-5 kW).
 *
 * Scoring Formula:
 * score = 0.40 * skillFit + 0.25 * proximity + 0.20 * workloadBalance + 0.15 * siteContinuity
 */

export interface CandidateTechnician {
  id: string; // technician id
  userId: string;
  name: string;
  isCrewLead: boolean;
  skills: string[]; // e.g. ['SOLAR_INSTALL', 'BATTERY', 'INVERTER', 'ROOF_MOUNT']
  hoursThisWeek: number;
  jobsOnDate: number;
  onLeaveOnDate: boolean;
  baseLat?: number;
  baseLng?: number;
}

export interface CandidateCrew {
  lead: CandidateTechnician;
  members: CandidateTechnician[];
}

export interface JobRequirements {
  capacityKw: number;
  systemType: 'ON_GRID' | 'OFF_GRID';
  targetDate: string | Date;
  siteLat?: number;
  siteLng?: number;
  surveyorUserId?: string;
  maxJobsPerDay?: number;
}

export interface CrewScoreBreakdown {
  skillFit: number;
  proximity: number;
  workloadBalance: number;
  siteContinuity: number;
  totalScore: number;
}

export interface ScoredCrewSuggestion {
  leadId: string;
  leadName: string;
  memberIds: string[];
  memberNames: string[];
  crewSize: number;
  breakdown: CrewScoreBreakdown;
  isRecommended: boolean;
}

export interface HardConstraintResult {
  passed: boolean;
  reason?: string;
}

/**
 * Checks all hard constraints for a candidate crew.
 */
export function evaluateHardConstraints(
  crew: CandidateCrew,
  req: JobRequirements
): HardConstraintResult {
  const maxJobs = req.maxJobsPerDay ?? 2;
  const allCrew = [crew.lead, ...crew.members];

  // 1. Crew lead validity
  if (!crew.lead.isCrewLead) {
    return { passed: false, reason: 'Designated lead is not certified as crew lead' };
  }

  // 2. Off-Grid battery skill requirement
  if (req.systemType === 'OFF_GRID') {
    const hasBatterySkill = crew.lead.skills.some((s) =>
      s.toUpperCase().includes('BATTERY') || s.toUpperCase().includes('OFF_GRID')
    );
    if (!hasBatterySkill) {
      return { passed: false, reason: 'Crew lead lacks mandatory battery skill for Off-Grid installation' };
    }
  }

  // 3. Crew size check
  const requiredSize = req.capacityKw > 3 ? 3 : 2;
  const currentSize = allCrew.length;
  if (currentSize < requiredSize) {
    return {
      passed: false,
      reason: `System capacity of ${req.capacityKw} kW requires at least ${requiredSize} technicians (crew has ${currentSize})`,
    };
  }

  // 4. Leave & Max jobs check
  for (const tech of allCrew) {
    if (tech.onLeaveOnDate) {
      return { passed: false, reason: `Technician ${tech.name} is on approved leave on target date` };
    }
    if (tech.jobsOnDate >= maxJobs) {
      return { passed: false, reason: `Technician ${tech.name} has reached maximum ${maxJobs} jobs for this date` };
    }
  }

  return { passed: true };
}

/**
 * Computes straight line distance between coordinates in km (Haversine formula)
 */
function calculateDistanceKm(lat1?: number, lon1?: number, lat2?: number, lon2?: number): number {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return 15; // default fallback 15 km within Ahmedabad city
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Scores an eligible candidate crew
 */
export function scoreCrew(crew: CandidateCrew, req: JobRequirements): CrewScoreBreakdown {
  const allCrew = [crew.lead, ...crew.members];

  // 1. Skill Fit (0.40): Ratio of matching skills
  const desiredSkills = ['SOLAR_INSTALL', 'ELECTRICAL', 'ROOF_MOUNT'];
  if (req.systemType === 'OFF_GRID') desiredSkills.push('BATTERY');

  let matchedSkillsCount = 0;
  for (const skill of desiredSkills) {
    if (allCrew.some((t) => t.skills.some((s) => s.toUpperCase().includes(skill)))) {
      matchedSkillsCount++;
    }
  }
  const skillFit = Number((matchedSkillsCount / desiredSkills.length).toFixed(2));

  // 2. Proximity (0.25): Distance from site (0 to 50 km scale)
  const dist = calculateDistanceKm(crew.lead.baseLat, crew.lead.baseLng, req.siteLat, req.siteLng);
  const proximity = Number(Math.max(0, Math.min(1, 1 - dist / 50)).toFixed(2));

  // 3. Workload Balance (0.20): Favours crews with fewer hours this week (scaled against 40 hours)
  const avgHours = allCrew.reduce((acc, t) => acc + t.hoursThisWeek, 0) / allCrew.length;
  const workloadBalance = Number(Math.max(0, Math.min(1, 1 - avgHours / 40)).toFixed(2));

  // 4. Site Continuity (0.15): Rewards technician who surveyed the site
  const siteContinuity =
    req.surveyorUserId && allCrew.some((t) => t.userId === req.surveyorUserId) ? 1.0 : 0.0;

  // Total weighted score
  const totalScore = Number(
    (0.4 * skillFit + 0.25 * proximity + 0.2 * workloadBalance + 0.15 * siteContinuity).toFixed(3)
  );

  return {
    skillFit,
    proximity,
    workloadBalance,
    siteContinuity,
    totalScore,
  };
}

/**
 * Evaluates, filters, and ranks candidate crews, returning top suggestions
 */
export function rankCrewSuggestions(
  crews: CandidateCrew[],
  req: JobRequirements,
  limit: number = 3
): ScoredCrewSuggestion[] {
  const scoredList: { crew: CandidateCrew; breakdown: CrewScoreBreakdown }[] = [];

  for (const crew of crews) {
    const hardCheck = evaluateHardConstraints(crew, req);
    if (!hardCheck.passed) continue;

    const breakdown = scoreCrew(crew, req);
    scoredList.push({ crew, breakdown });
  }

  // Sort descending by totalScore
  scoredList.sort((a, b) => b.breakdown.totalScore - a.breakdown.totalScore);

  return scoredList.slice(0, limit).map((item, idx) => ({
    leadId: item.crew.lead.id,
    leadName: item.crew.lead.name,
    memberIds: item.crew.members.map((m) => m.id),
    memberNames: item.crew.members.map((m) => m.name),
    crewSize: item.crew.members.length + 1,
    breakdown: item.breakdown,
    isRecommended: idx === 0,
  }));
}

