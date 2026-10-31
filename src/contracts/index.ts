import { z } from 'zod';

// ==========================================
// Public Enquiry Form Contract (S1 / FR-1.1)
// ==========================================
export const CreateEnquirySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Valid phone number is required (e.g. +919876543210)'),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().min(5, 'Full street address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().default('Gujarat'),
  pincode: z.string().regex(/^\d{6}$/, 'Valid 6-digit Indian PIN code required'),
  requestedCapacityKw: z.number().positive().max(50).optional(),
  systemTypePref: z.enum(['ON_GRID', 'OFF_GRID', 'HYBRID']).default('ON_GRID'),
  wantsSubsidy: z.boolean().default(false),
  monthlyBillRupees: z.number().nonnegative().optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Consent to contact is mandatory' }),
  }),
  honeypot: z.string().max(0, 'Spam detected').optional(), // Bot trap
});

export type CreateEnquiryInput = z.infer<typeof CreateEnquirySchema>;

// ==========================================
// Lead Qualification & Transition Contracts
// ==========================================
export const QualifyLeadSchema = z.object({
  roofAreaSqm: z.number().positive('Roof area must be greater than 0'),
  monthlyBillRupees: z.number().positive().optional(),
  monthlyUnits: z.number().positive().optional(),
  tariffRupees: z.number().positive().default(7),
  gridOk: z.boolean(),
  sanctionedLoadKw: z.number().positive(),
  phase: z.enum(['SINGLE', 'THREE']),
});

export const LeadTransitionSchema = z.object({
  toStatus: z.enum([
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'SURVEY_SCHEDULED',
    'SURVEY_APPROVED',
    'QUOTED',
    'WON',
    'LOST',
    'DISQUALIFIED',
  ]),
  reason: z.string().optional(),
});

// ==========================================
// Survey Submission & Review Contracts
// ==========================================
export const SubmitSurveySchema = z.object({
  roofType: z.enum(['RCC_FLAT', 'TIN_SHED', 'TILED', 'OTHER']),
  azimuthDeg: z.number().min(0).max(359),
  tiltDeg: z.number().min(0).max(90),
  usableAreaSqm: z.number().positive(),
  shading: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
  cableDistanceM: z.number().positive(),
  structureHeightM: z.number().positive().optional(),
  notes: z.string().optional(),
  photoAttachmentIds: z.array(z.string().uuid()).min(1, 'At least 1 survey photo required'),
});

export const ReviewSurveySchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().optional(),
});

// ==========================================
// Quotation & BOM Contracts
// ==========================================
export const BomPreviewSchema = z.object({
  templateId: z.string().uuid(),
  capacityKw: z.number().positive(),
  cableDistanceM: z.number().positive().default(25),
});

export const CreateQuoteSchema = z.object({
  leadId: z.string().uuid(),
  templateId: z.string().uuid(),
  capacityKw: z.number().positive(),
  cableDistanceM: z.number().positive().default(25),
  discountRupees: z.number().nonnegative().default(0),
  validDays: z.number().int().positive().default(15),
});

export const QuoteDecisionSchema = z.object({
  action: z.enum(['ACCEPT', 'REJECT']),
  acceptedName: z.string().optional(),
  rejectReason: z.string().optional(),
  phoneLastFour: z.string().length(4, 'Last 4 digits of phone required for verification'),
  idempotencyKey: z.string().uuid(),
});

// ==========================================
// Payment Contracts (FR-4.2 / D16)
// ==========================================
export const RecordPaymentSchema = z.object({
  orderId: z.string().uuid(),
  amountRupees: z.number().positive(),
  method: z.enum(['UPI', 'NEFT', 'CASH', 'CHEQUE', 'LOAN']),
  kind: z.enum(['ADVANCE', 'PART', 'FINAL', 'SERVICE']),
  reference: z.string().optional(),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().uuid(),
});

// ==========================================
// Dispatch & Scan Contracts (FR-5.4 / D16)
// ==========================================
export const DispatchScanSchema = z.object({
  code: z.string().min(3),
  method: z.enum(['QR', 'BARCODE', 'MANUAL']).default('QR'),
  idempotencyKey: z.string().uuid(),
});

// ==========================================
// Installation Sign-Off Contracts (FR-6.3-6.6)
// ==========================================
export const InstallationSignoffSchema = z.object({
  checklist: z.object({
    standsMounted: z.literal(true, { errorMap: () => ({ message: 'Stands mounted is required' }) }),
    panelsLaid: z.literal(true, { errorMap: () => ({ message: 'Panels laid is required' }) }),
    wiringConnected: z.literal(true, { errorMap: () => ({ message: 'Wiring connected is required' }) }),
    earthingDone: z.literal(true, { errorMap: () => ({ message: 'Earthing done is required' }) }),
    generationTested: z.literal(true, { errorMap: () => ({ message: 'Generation tested is required' }) }),
  }),
  installedCapacityKw: z.number().positive(),
  testReadingW: z.number().positive(),
  signedName: z.string().min(2, 'Customer signature name required'),
  signatureAttachmentId: z.string().uuid('Signature image is required'),
  photoAttachmentIds: z.array(z.string().uuid()).min(3, 'At least 3 photos (array, inverter, earthing) required'),
  idempotencyKey: z.string().uuid(),
});

// ==========================================
// Support & Service Ticket Contracts (FR-7.3)
// ==========================================
export const CreateTicketSchema = z.object({
  customerId: z.string().uuid(),
  installationId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  serialNumber: z.string().optional(),
  channel: z.enum(['PHONE', 'WHATSAPP', 'WEB', 'VISIT', 'MAINTENANCE_ALERT']).default('PHONE'),
  category: z.enum(['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER']),
  faultCode: z.string().optional(),
  description: z.string().min(5),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});

// ==========================================
// Customer Portal Verification Contract
// ==========================================
export const PortalVerifySchema = z.object({
  phoneLastFour: z.string().length(4, 'Must enter last 4 digits of phone'),
});

