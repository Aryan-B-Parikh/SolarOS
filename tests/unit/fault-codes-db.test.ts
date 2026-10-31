/**
 * SunPower Ops - FR-7.9 Fault Code Catalogue (DB-driven, per-model + free text)
 * Unit tests for the pure matching helper used by createTicket.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchFaultCode,
  type FaultCodesByModel,
} from '../../src/services/tickets.ts';

const catalogue: FaultCodesByModel = {
  'MIC-3000TL-X': [
    { code: 'E01', description: 'Grid voltage out of range', defaultPriority: 'HIGH' },
    { code: 'E02', description: 'PV Isolation low', defaultPriority: 'URGENT' },
  ],
  'MIN-5000TL-X': [
    { code: 'E01', description: 'Grid voltage out of range', defaultPriority: 'HIGH' },
    { code: 'E11', description: 'Fan failure', defaultPriority: 'NORMAL' },
  ],
};

describe('FR-7.9 - Fault code catalogue matching (per-model list + free text)', () => {
  it('recognises a code for the unit own model (exact)', () => {
    const result = matchFaultCode(catalogue, 'MIC-3000TL-X', 'E01');
    assert.equal(result.isKnown, true);
    assert.equal(result.normalizedCode, 'E01');
    assert.equal(result.matchedModel, 'MIC-3000TL-X');
  });

  it('matches case-insensitively and trims whitespace', () => {
    const result = matchFaultCode(catalogue, 'MIC-3000TL-X', '  e02 ');
    assert.equal(result.isKnown, true);
    assert.equal(result.normalizedCode, 'E02');
  });

  it('falls back to any-model match when the unit model differs or is unknown', () => {
    // Code exists in the catalogue but for another model (customer read it off the display)
    const result = matchFaultCode(catalogue, 'UNKNOWN-MODEL', 'E11');
    assert.equal(result.isKnown, true);
    assert.equal(result.normalizedCode, 'E11');
    assert.equal(result.matchedModel, 'MIN-5000TL-X');
  });

  it('accepts uncatalogued codes as free text, stored verbatim as reported', () => {
    const result = matchFaultCode(catalogue, 'MIC-3000TL-X', 'E999');
    assert.equal(result.isKnown, false);
    assert.equal(result.normalizedCode, 'E999');
    assert.equal(result.matchedModel, null);
  });

  it('treats an empty code as unknown without normalizing to a value', () => {
    const result = matchFaultCode(catalogue, 'MIC-3000TL-X', '   ');
    assert.equal(result.isKnown, false);
    assert.equal(result.normalizedCode, '');
  });

  it('prefers the unit own model over another model with the same code', () => {
    const result = matchFaultCode(catalogue, 'MIN-5000TL-X', 'E01');
    assert.equal(result.isKnown, true);
    assert.equal(result.matchedModel, 'MIN-5000TL-X');
  });
});
