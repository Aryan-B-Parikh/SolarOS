/**
 * SunPower Ops - Fault Codes Taxonomy
 * Specification Reference: TRD 2.4, Backend Schema 5.3 & 5.4, Implementation Plan Phase 7
 */

export type TicketCategory = 'NO_POWER' | 'FAULT_CODE' | 'LOW_GENERATION' | 'DAMAGE' | 'OTHER';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface FaultCodeDefinition {
  code: string;
  name: string;
  category: TicketCategory;
  defaultPriority: TicketPriority;
  description: string;
  recommendedAction: string;
}

export const SOLAR_FAULT_CODES: Record<string, FaultCodeDefinition> = {
  E001: {
    code: 'E001',
    name: 'Grid Overvoltage (OV-G)',
    category: 'FAULT_CODE',
    defaultPriority: 'HIGH',
    description: 'Utility grid voltage exceeds inverter upper safety threshold.',
    recommendedAction: 'Measure AC grid voltage at ACDB. Coordinate with DISCOM if grid consistently exceeds nominal voltage.',
  },
  E002: {
    code: 'E002',
    name: 'Grid Undervoltage (UV-G)',
    category: 'FAULT_CODE',
    defaultPriority: 'NORMAL',
    description: 'Utility grid voltage fell below lower operational boundary.',
    recommendedAction: 'Inspect AC breakers, earthing connection, and local phase balance.',
  },
  E003: {
    code: 'E003',
    name: 'Inverter Overtemperature (OT-INV)',
    category: 'FAULT_CODE',
    defaultPriority: 'NORMAL',
    description: 'Internal heat-sink temperature exceeded safe operational ceiling.',
    recommendedAction: 'Verify adequate ventilation, clear debris from heat sink fins, check cooling fans.',
  },
  E004: {
    code: 'E004',
    name: 'PV Isolation / Insulation Fault (ISO-F)',
    category: 'NO_POWER',
    defaultPriority: 'URGENT',
    description: 'Low insulation resistance detected between DC conductors and earth ground.',
    recommendedAction: 'Check DC cables, connectors (MC4), and array earthing for water ingress or cable damage.',
  },
  E005: {
    code: 'E005',
    name: 'DC Injection High (DCI-H)',
    category: 'FAULT_CODE',
    defaultPriority: 'HIGH',
    description: 'DC current component injected into AC grid exceeds utility limit.',
    recommendedAction: 'Perform inverter restart. If persistent, replace inverter under warranty.',
  },
  E006: {
    code: 'E006',
    name: 'Earth / Ground Fault (GF-F)',
    category: 'NO_POWER',
    defaultPriority: 'URGENT',
    description: 'Ground current leakage trip detected by inverter residual current monitor.',
    recommendedAction: 'Immediate site visit required. Test earthing pit resistance (< 5 ohms) and array bonding.',
  },
  E007: {
    code: 'E007',
    name: 'Relay Check Failure (RLY-F)',
    category: 'FAULT_CODE',
    defaultPriority: 'HIGH',
    description: 'Internal grid disconnect relay open/close self-test failure.',
    recommendedAction: 'Internal hardware fault. RMA warranty replacement required.',
  },
  E008: {
    code: 'E008',
    name: 'Communication / Telemetry Lost (COM-L)',
    category: 'OTHER',
    defaultPriority: 'LOW',
    description: 'WiFi/GSM dongle cannot reach SunPower monitoring servers.',
    recommendedAction: 'Re-authenticate homeowner WiFi credentials on the dongle.',
  },
};

/**
 * Resolves a fault code string to its standard definition or creates a generic fallback.
 */
export function lookupFaultCode(code?: string | null): FaultCodeDefinition | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return SOLAR_FAULT_CODES[upper] || {
    code: upper,
    name: `Custom Code ${upper}`,
    category: 'FAULT_CODE',
    defaultPriority: 'NORMAL',
    description: 'Uncatalogued inverter or charge controller error code.',
    recommendedAction: 'Refer to OEM equipment service manual.',
  };
}

