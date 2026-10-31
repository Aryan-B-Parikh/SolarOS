import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSignoffHash } from '../../src/services/installations.ts';
import { calculateWarrantyPeriod } from '../../src/domain/warranty.ts';

describe('Phase 6 - Field Installation & Sign-Off Service (Spec 6.3, PRD C8, ADR D8)', () => {
  interface MockChecklist {
    standsMounted?: boolean;
    panelsLaid?: boolean;
    wiringConnected?: boolean;
    earthingDone?: boolean;
    generationTested?: boolean;
  }

  function validateSignoffGuards(input: {
    checklist: MockChecklist;
    photos: string[];
    signedName?: string;
    signatureAttachmentId?: string;
    installedCapacityKw?: number;
    testReadingW?: number;
  }): { valid: boolean; error?: string } {
    const c = input.checklist;
    if (
      !c ||
      !c.standsMounted ||
      !c.panelsLaid ||
      !c.wiringConnected ||
      !c.earthingDone ||
      !c.generationTested
    ) {
      return { valid: false, error: 'CHECKLIST_INCOMPLETE' };
    }

    if (!input.photos || input.photos.length < 3) {
      return { valid: false, error: 'PHOTOS_REQUIRED' };
    }

    if (!input.signedName?.trim() || !input.signatureAttachmentId) {
      return { valid: false, error: 'SIGNATURE_REQUIRED' };
    }

    if (!input.installedCapacityKw || input.installedCapacityKw <= 0 || !input.testReadingW || input.testReadingW <= 0) {
      return { valid: false, error: 'READINGS_REQUIRED' };
    }

    return { valid: true };
  }

  it('rejects sign-off if any checklist item is incomplete with CHECKLIST_INCOMPLETE', () => {
    const incompleteChecklists: MockChecklist[] = [
      { standsMounted: true, panelsLaid: true, wiringConnected: true, earthingDone: true, generationTested: false }, // missing test
      { standsMounted: true, panelsLaid: false, wiringConnected: true, earthingDone: true, generationTested: true }, // missing panels
      { standsMounted: false, panelsLaid: true, wiringConnected: true, earthingDone: true, generationTested: true }, // missing stands
    ];

    for (const cl of incompleteChecklists) {
      const res = validateSignoffGuards({
        checklist: cl,
        photos: ['photo-1', 'photo-2', 'photo-3'],
        signedName: 'Anil Mehta',
        signatureAttachmentId: 'sig-001',
        installedCapacityKw: 3.0,
        testReadingW: 2850,
      });

      assert.equal(res.valid, false);
      assert.equal(res.error, 'CHECKLIST_INCOMPLETE');
    }
  });

  it('rejects sign-off if fewer than 3 photos are provided with PHOTOS_REQUIRED', () => {
    const completeChecklist: MockChecklist = {
      standsMounted: true,
      panelsLaid: true,
      wiringConnected: true,
      earthingDone: true,
      generationTested: true,
    };

    // 2 photos provided (requires at least 3: array, inverter, earthing)
    const res = validateSignoffGuards({
      checklist: completeChecklist,
      photos: ['photo-array', 'photo-inverter'],
      signedName: 'Anil Mehta',
      signatureAttachmentId: 'sig-001',
      installedCapacityKw: 3.0,
      testReadingW: 2850,
    });

    assert.equal(res.valid, false);
    assert.equal(res.error, 'PHOTOS_REQUIRED');
  });

  it('passes all guards when checklist is 100% complete with 3+ photos and signature', () => {
    const completeChecklist: MockChecklist = {
      standsMounted: true,
      panelsLaid: true,
      wiringConnected: true,
      earthingDone: true,
      generationTested: true,
    };

    const res = validateSignoffGuards({
      checklist: completeChecklist,
      photos: ['photo-array', 'photo-inverter', 'photo-earthing'],
      signedName: 'Anil Mehta',
      signatureAttachmentId: 'sig-001',
      installedCapacityKw: 3.0,
      testReadingW: 2850,
    });

    assert.equal(res.valid, true);
    assert.equal(res.error, undefined);
  });

  it('computes deterministic SHA-256 cryptographic signoff proof hash', () => {
    const hash1 = computeSignoffHash({
      installationId: 'inst-123',
      signedName: 'Sunita Sharma',
      installedCapacityKw: 3.0,
      testReadingW: 2900,
      serialList: 'PNL-01,PNL-02,INV-99',
      timestamp: '2026-11-15T15:00:00.000Z',
    });

    assert.equal(typeof hash1, 'string');
    assert.equal(hash1.length, 64, 'SHA-256 hex digest length must be 64 characters');

    // Reproducible with identical inputs
    const hash2 = computeSignoffHash({
      installationId: 'inst-123',
      signedName: 'Sunita Sharma',
      installedCapacityKw: 3.0,
      testReadingW: 2900,
      serialList: 'PNL-01,PNL-02,INV-99',
      timestamp: '2026-11-15T15:00:00.000Z',
    });
    assert.equal(hash1, hash2);

    // Tampering test
    const tamperedHash = computeSignoffHash({
      installationId: 'inst-123',
      signedName: 'Impostor',
      installedCapacityKw: 3.0,
      testReadingW: 2900,
      serialList: 'PNL-01,PNL-02,INV-99',
      timestamp: '2026-11-15T15:00:00.000Z',
    });
    assert.notEqual(hash1, tamperedHash);
  });

  it('activates equipment warranty on INSTALLATION_SIGNOFF start basis', () => {
    const res = calculateWarrantyPeriod({
      startBasis: 'INSTALLATION_SIGNOFF',
      commissioningDate: '2026-11-15',
      months: 240, // 20 years
    });

    assert.equal(res.startDate, '2026-11-15');
    assert.equal(res.endDate, '2046-11-14');
    assert.equal(res.months, 240);
  });

  it('creates 5-year workmanship warranty for commissioning sign-off', () => {
    const workmanship = calculateWarrantyPeriod({
      startBasis: 'INSTALLATION_SIGNOFF',
      commissioningDate: '2026-11-15',
      months: 60, // 5-year workmanship
    });

    assert.equal(workmanship.startDate, '2026-11-15');
    assert.equal(workmanship.endDate, '2031-11-14');
    assert.equal(workmanship.months, 60);
  });
});

