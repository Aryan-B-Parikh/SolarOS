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

// Staff-logged enquiry (FR-1.2): sales records WhatsApp/phone/walk-in/referral
// enquiries with source + explicit owner. Public form fields still apply.
export const LeadSourceEnum = z.enum(['WEB', 'WHATSAPP', 'PHONE', 'WALK_IN', 'REFERRAL']);

export const CreateStaffLeadSchema = CreateEnquirySchema.extend({
  source: LeadSourceEnum.optional(),
  ownerId: z.string().uuid('Valid sales owner UUID required').optional(),
});

export type CreateStaffLeadInput = z.infer<typeof CreateStaffLeadSchema>;

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

export const ReviseQuoteSchema = z.object({
  discountRupees: z.number().nonnegative().optional(),
  validDays: z.number().int().positive().optional(),
  cableDistanceM: z.number().positive().optional(),
  capacityKw: z.number().positive().optional(),
});

export const UpdateQuoteLineSchema = z.object({
  lineId: z.string().uuid(),
  qty: z.number().positive(),
  manualReason: z.string().min(3, 'A reason is required when manually modifying quantities'),
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



// ==========================================
// Phase 5: Dispatch & Inventory Operations (FR-5.1 - FR-5.6)
// ==========================================
export const ScanDispatchUnitSchema = z.object({
  unitCode: z.string().min(1, 'Serial number or QR code is required'),
  method: z.enum(['QR', 'BARCODE', 'MANUAL']).default('QR'),
});

export const UnscanDispatchUnitSchema = z.object({
  unitId: z.string().uuid('Valid unit UUID required'),
});

export const DepartDispatchSchema = z.object({
  departedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

export const DeliverDispatchSchema = z.object({
  deliveredAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  deliveredLat: z.number().optional(),
  deliveredLng: z.number().optional(),
});

export const AdjustStockSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  qtyDelta: z.number().refine((val) => val !== 0, 'Quantity delta cannot be zero'),
  reason: z.string().min(3, 'A justification reason is required'),
});

export const ReceiveGoodsSchema = z.object({
  receiptNumber: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  poId: z.string().uuid().optional(),
  supplierInvoiceRef: z.string().optional(),
  locationId: z.string().uuid(),
  receivedOn: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      qty: z.number().positive(),
      unitCostPaise: z.number().nonnegative(),
      poLineId: z.string().uuid().optional(),
      serialNumbers: z.array(z.string()).optional(),
    })
  ).min(1, 'At least one line item is required'),
});


// ==========================================
// Phase 6: Field Installation Job Stepper Contracts
// ==========================================
export const StartInstallationSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const UpdateInstallationDraftSchema = z.object({
  checklist: z.record(z.boolean()).optional(),
  installedCapacityKw: z.number().positive().optional(),
  testReadingW: z.number().nonnegative().optional(),
});

export const HoldInstallationSchema = z.object({
  holdReason: z.string().min(3, 'A reason is required when holding an installation job'),
});

// ==========================================
// Phase 7: Service Desk, Tickets & Search Contracts (PRD C9, ADR D5)
// ==========================================
export const SearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
});

export const AssignTicketSchema = z.object({
  technicianId: z.string().uuid('Valid technician UUID is required'),
  scheduledDate: z.string().optional(),
});

export const ReplaceTicketPartSchema = z.object({
  removedUnitCode: z.string().min(1, 'Removed serial or QR code is required'),
  replacementUnitCode: z.string().min(1, 'Replacement serial or QR code is required'),
  isChargeable: z.boolean().optional(),
  unitPricePaise: z.number().nonnegative().optional(),
});

export const ResolveTicketSchema = z.object({
  resolutionNotes: z.string().min(3, 'Resolution notes are required'),
  isChargeable: z.boolean().optional(),
  laborCostPaise: z.number().nonnegative().optional(),
  partsCostPaise: z.number().nonnegative().optional(),
});

export const ConfirmTicketSchema = z.object({
  confirmationMethod: z.enum(['PORTAL', 'PHONE']).default('PORTAL'),
  customerFeedback: z.string().optional(),
});

export const ReopenTicketSchema = z.object({
  reason: z.string().min(3, 'Reason for reopening is required'),
});

export const ExcludeWarrantySchema = z.object({
  reason: z.string().min(3, 'Exclusion reason is required'),
});

export const PortalCreateTicketSchema = z.object({
  installationId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  category: z.enum(['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER']),
  faultCode: z.string().optional(),
  description: z.string().min(5, 'Please provide details of the issue (at least 5 characters)'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
});

// ==========================================
// Phase 8: Analytics & Predictive Maintenance
// ==========================================

export const AnalyticsPeriodSchema = z.enum(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM']);

export const ProfitabilityQuerySchema = z.object({
  period: AnalyticsPeriodSchema.optional(),
  customStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required').optional(),
  customEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required').optional(),
  isLossOnly: z.boolean().optional(),
  status: z.string().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export const CreateShareLinkSchema = z.object({
  period: AnalyticsPeriodSchema.default('THIS_MONTH'),
  durationHours: z.number().int().positive().max(168, 'Maximum share link duration is 7 days (168 hours)').default(24),
});

export const ConvertAlertSchema = z.object({
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  description: z.string().optional(),
});

export const MaintenanceCronQuerySchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required').optional(),
});
