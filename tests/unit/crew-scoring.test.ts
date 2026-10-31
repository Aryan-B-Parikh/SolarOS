import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateHardConstraints,
  scoreCrew,
  rankCrewSuggestions,
  type CandidateCrew,
  type CandidateTechnician,
  type JobRequirements,
} from '../../src/domain/crew-scoring.ts';

describe('Member 1 - Crew Allocation & Scoring Engine (TRD 2.4, Phase 4)', () => {
  const leadTech: CandidateTechnician = {
    id: 't-lead-1',
    userId: 'u-lead-1',
    name: 'Rajesh Sharma',
    isCrewLead: true,
    skills: ['SOLAR_INSTALL', 'ELECTRICAL', 'ROOF_MOUNT', 'BATTERY'],
    hoursThisWeek: 15,
    jobsOnDate: 0,
    onLeaveOnDate: false,
    baseLat: 23.0225,
    baseLng: 72.5714,
  };

  const helperTech: CandidateTechnician = {
    id: 't-helper-1',
    userId: 'u-helper-1',
    name: 'Amit Patel',
    isCrewLead: false,
    skills: ['SOLAR_INSTALL', 'ROOF_MOUNT'],
    hoursThisWeek: 20,
    jobsOnDate: 0,
    onLeaveOnDate: false,
    baseLat: 23.03,
    baseLng: 72.58,
  };

  const baseCrew: CandidateCrew = {
    lead: leadTech,
    members: [helperTech],
  };

  it('rejects candidate crew if lead is not a designated crew lead', () => {
    const invalidCrew: CandidateCrew = {
      lead: { ...helperTech, isCrewLead: false },
      members: [leadTech],
    };
    const req: JobRequirements = {
      capacityKw: 3,
      systemType: 'ON_GRID',
      targetDate: new Date(),
    };
    const result = evaluateHardConstraints(invalidCrew, req);
    assert.equal(result.passed, false);
    assert.ok(result.reason?.includes('not certified as crew lead'));
  });

  it('enforces mandatory battery skill for Off-Grid installations', () => {
    const noBatteryLead: CandidateTechnician = {
      ...leadTech,
      skills: ['SOLAR_INSTALL', 'ELECTRICAL'], // No battery skill
    };
    const offGridReq: JobRequirements = {
      capacityKw: 3,
      systemType: 'OFF_GRID',
      targetDate: new Date(),
    };
    const result = evaluateHardConstraints({ lead: noBatteryLead, members: [helperTech] }, offGridReq);
    assert.equal(result.passed, false);
    assert.ok(result.reason?.includes('lacks mandatory battery skill'));
  });

  it('enforces minimum 3 technicians for installations > 3 kW', () => {
    const req4Kw: JobRequirements = {
      capacityKw: 4,
      systemType: 'ON_GRID',
      targetDate: new Date(),
    };
    // 2-person crew on 4 kW system fails size constraint
    const result = evaluateHardConstraints(baseCrew, req4Kw);
    assert.equal(result.passed, false);
    assert.ok(result.reason?.includes('requires at least 3 technicians'));
  });

  it('rejects crew members who are on leave on the target date', () => {
    const onLeaveCrew: CandidateCrew = {
      lead: leadTech,
      members: [{ ...helperTech, onLeaveOnDate: true }],
    };
    const req: JobRequirements = {
      capacityKw: 3,
      systemType: 'ON_GRID',
      targetDate: new Date(),
    };
    const result = evaluateHardConstraints(onLeaveCrew, req);
    assert.equal(result.passed, false);
    assert.ok(result.reason?.includes('on approved leave'));
  });

  it('rejects crew members who have reached maximum jobs per day (>= 2)', () => {
    const busyCrew: CandidateCrew = {
      lead: { ...leadTech, jobsOnDate: 2 },
      members: [helperTech],
    };
    const req: JobRequirements = {
      capacityKw: 3,
      systemType: 'ON_GRID',
      targetDate: new Date(),
    };
    const result = evaluateHardConstraints(busyCrew, req);
    assert.equal(result.passed, false);
    assert.ok(result.reason?.includes('reached maximum 2 jobs'));
  });

  it('calculates weighted score correctly with site continuity bonus', () => {
    const req: JobRequirements = {
      capacityKw: 3,
      systemType: 'ON_GRID',
      targetDate: new Date(),
      siteLat: 23.0225,
      siteLng: 72.5714, // Exact match with lead base
      surveyorUserId: 'u-lead-1', // Lead surveyed the site!
    };

    const breakdown = scoreCrew(baseCrew, req);
    assert.equal(breakdown.proximity, 1.0); // 0 km distance
    assert.equal(breakdown.siteContinuity, 1.0); // Continuity rewarded
    assert.ok(breakdown.totalScore > 0.7);
  });

  it('ranks crews and marks top crew as recommended', () => {
    const crew2: CandidateCrew = {
      lead: { ...leadTech, id: 't-lead-2', name: 'Suresh Verma', hoursThisWeek: 35 },
      members: [helperTech],
    };

    const req: JobRequirements = {
      capacityKw: 3,
      systemType: 'ON_GRID',
      targetDate: new Date(),
      surveyorUserId: 'u-lead-1', // Favours baseCrew lead
    };

    const suggestions = rankCrewSuggestions([crew2, baseCrew], req, 2);
    assert.equal(suggestions.length, 2);
    assert.equal(suggestions[0].leadName, 'Rajesh Sharma'); // Higher score
    assert.equal(suggestions[0].isRecommended, true);
    assert.equal(suggestions[1].isRecommended, false);
  });
});
