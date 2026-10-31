/**
 * SunPower Ops - Field Installation & Customer Sign-Off Service (TRD 2.4, Spec 6.3 Phase 6, ADR D8, D11)
 * Job stepper, time logging, hold/reschedule workflows, mandatory photo/checklist guards,
 * cryptographic SHA-256 sign-off proof hashing, commissioning warranty activation, and 90-day certificate link issuance.
 */

import { prisma } from '../lib/db.ts';
import { AppError } from '../lib/errors.ts';
import { recordAudit } from '../lib/audit.ts';
import { generateAccessToken } from '../lib/access-links.ts';
import { calculateWarrantyPeriod } from '../domain/warranty.ts';
import { queueNotification } from '../lib/outbox.ts';
import crypto from 'node:crypto';
import {
  InstallationStatus,
  OrderStatus,
  UnitStatus,
  AttachmentOwnerType,
  WarrantyCoverage,
  WarrantyStatus,
  WarrantySource,
} from '@prisma/client';

export interface StartInstallationInput {
  installationId: string;
  actorId?: string;
  lat?: number;
  lng?: number;
}

export interface UpdateDraftInput {
  installationId: string;
  checklist?: Record<string, boolean>;
  installedCapacityKw?: number;
  testReadingW?: number;
  actorId?: string;
}

export interface SignOffInput {
  installationId: string;
  signedName: string;
  signatureAttachmentId: string;
  photoAttachmentIds: string[];
  checklist: {
    standsMounted: boolean;
    panelsLaid: boolean;
    wiringConnected: boolean;
    earthingDone: boolean;
    generationTested: boolean;
  };
  installedCapacityKw: number;
  testReadingW: number;
  actorId?: string;
  idempotencyKey?: string;
}

/**
 * Computes deterministic SHA-256 cryptographic sign-off proof hash (C8).
 */
export function computeSignoffHash(data: {
  installationId: string;
  signedName: string;
  installedCapacityKw: number | string;
  testReadingW: number | string;
  serialList: string;
  timestamp: string;
}): string {
  const proofString = `${data.installationId}:${data.signedName.trim()}:${data.installedCapacityKw}:${data.testReadingW}:${data.serialList}:${data.timestamp}`;
  return crypto.createHash('sha256').update(proofString).digest('hex');
}

/**
 * Retrieves installation record with order details, crew, checklist, before/after photos, and certificate info.
 */
export async function getInstallation(id: string) {
  const inst = await prisma.installation.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          customer: true,
          lines: {
            include: { product: true },
          },
          quote: {
            include: {
              lead: {
                include: {
                  survey: true, // 1:1 with Lead
                },
              },
            },
          },
        },
      },
      crew_lead: {
        select: { id: true, name: true, phone: true },
      },
      crew: {
        include: {
          technician: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      },
      signature_attachment: true,
      time_logs: {
        orderBy: { started_at: 'asc' },
      },
      warranties: true,
    },
  });

  if (!inst) {
    throw new AppError('NOT_FOUND', 'Installation record not found', 404);
  }

  // Fetch installation photo attachments (After photos)
  const afterPhotos = await prisma.attachment.findMany({
    where: {
      owner_type: AttachmentOwnerType.INSTALLATION,
      owner_id: inst.id,
    },
    orderBy: { created_at: 'asc' },
  });

  // Serialized units linked to this installation or to the underlying order
  // (units are bound to the installation at sign-off; before that they carry
  // the order id from dispatch - both must be visible to the field stepper)
  const units = await prisma.inventoryUnit.findMany({
    where: {
      OR: [{ installation_id: inst.id }, { order_id: inst.order_id }],
    },
    include: { product: true },
  });

  // Fetch survey photo attachments (Before photos)
  const approvedSurveyId =
    inst.order.quote?.lead?.survey?.status === 'APPROVED' ? inst.order.quote.lead.survey.id : null;
  const beforePhotos = approvedSurveyId
    ? await prisma.attachment.findMany({
        where: {
          owner_type: AttachmentOwnerType.SURVEY,
          owner_id: approvedSurveyId,
        },
        orderBy: { created_at: 'asc' },
      })
    : [];

  return {
    id: inst.id,
    orderId: inst.order_id,
    orderNumber: inst.order.order_number,
    customerName: inst.order.customer.name,
    customerPhone: inst.order.customer.phone,
    address: `${inst.order.customer.address}, ${inst.order.customer.city}`,
    status: inst.status,
    scheduledOn: inst.scheduled_on.toISOString().split('T')[0],
    slot: inst.slot,
    startedAt: inst.started_at?.toISOString() || null,
    finishedAt: inst.finished_at?.toISOString() || null,
    installedCapacityKw: inst.installed_capacity_kw ? Number(inst.installed_capacity_kw) : null,
    testReadingW: inst.test_reading_w ? Number(inst.test_reading_w) : null,
    checklist: inst.checklist,
    signedName: inst.signed_name,
    signedAt: inst.signed_at?.toISOString() || null,
    signoffHash: inst.signoff_hash,
    holdReason: inst.hold_reason,
    crewLead: inst.crew_lead,
    crew: inst.crew.map((c) => ({
      userId: c.technician.user.id,
      name: c.technician.user.name,
      phone: c.technician.user.phone,
      role: c.role,
    })),
    photos: {
      before: beforePhotos.map((p) => ({
        id: p.id,
        storageKey: p.storage_key,
        mime: p.mime,
        kind: p.kind,
      })),
      after: afterPhotos.map((p) => ({
        id: p.id,
        storageKey: p.storage_key,
        mime: p.mime,
        kind: p.kind,
      })),
    },
    // Certificates are numbered after the order they commission (deterministic)
    certificateNumber: `${inst.order.order_number}-CERT`,
    orderCapacityKw: Number(inst.order.capacity_kw),
    systemType: inst.order.system_type,
    lines: inst.order.lines.map((l) => ({
      productId: l.product_id,
      productName: l.product.name,
      productSku: l.product.sku,
      qty: Number(l.qty),
    })),
    units: units.map((u) => ({
      id: u.id,
      serialNumber: u.serial_number,
      productId: u.product_id,
      productName: u.product.name,
      productSku: u.product.sku,
      status: u.status,
    })),
    warranties: inst.warranties.map((w) => ({
      id: w.id,
      coverage: w.coverage,
      startDate: w.start_date.toISOString().split('T')[0],
      endDate: w.end_date.toISOString().split('T')[0],
      months: w.months,
      status: w.status,
    })),
  };
}

/**
 * Starts field installation job with technician GPS coordinates and begins automatic time tracking.
 */
export async function startInstallation(input: StartInstallationInput) {
  let actorId = input.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }
  if (!actorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const inst = await tx.installation.findUnique({
      where: { id: input.installationId },
    });

    if (!inst) {
      throw new AppError('NOT_FOUND', 'Installation record not found', 404);
    }

    if (inst.status !== InstallationStatus.SCHEDULED && inst.status !== InstallationStatus.ON_HOLD) {
      throw new AppError('INVALID_STATE', `Cannot start installation in ${inst.status} state`, 400);
    }

    // 1. Update installation status
    const updated = await tx.installation.update({
      where: { id: inst.id },
      data: {
        status: InstallationStatus.IN_PROGRESS,
        started_at: inst.started_at || now,
        start_lat: input.lat || inst.start_lat,
        start_lng: input.lng || inst.start_lng,
        hold_reason: null,
      },
    });

    // 2. Begin time tracking if technician record exists
    const tech = await tx.technician.findUnique({
      where: { user_id: actorId! },
    });

    if (tech) {
      await tx.timeLog.create({
        data: {
          technician_id: tech.user_id,
          installation_id: inst.id,
          started_at: now,
          ended_at: now, // Will be updated on sign-off
          hourly_cost_paise: tech.hourly_cost_paise || 50000n,
        },
      });
    }

    // 3. Record audit trail
    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'INSTALLATION',
        entityId: inst.id,
        action: 'INSTALLATION_STARTED',
        after: {
          status: InstallationStatus.IN_PROGRESS,
          startedAt: now.toISOString(),
          lat: input.lat,
          lng: input.lng,
        },
      },
      tx
    );

    return {
      installationId: updated.id,
      status: updated.status,
      startedAt: updated.started_at?.toISOString(),
    };
  });
}

/**
 * Updates draft checklist, capacity, and test readings as work progresses on site.
 */
export async function updateInstallationDraft(input: UpdateDraftInput) {
  let actorId = input.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }

  const inst = await prisma.installation.findUnique({
    where: { id: input.installationId },
  });

  if (!inst) {
    throw new AppError('NOT_FOUND', 'Installation record not found', 404);
  }

  if (inst.status === InstallationStatus.COMPLETED) {
    throw new AppError('INVALID_STATE', 'Cannot modify draft on completed installation', 400);
  }

  const existingChecklist = (inst.checklist as Record<string, boolean>) || {};
  const mergedChecklist = input.checklist
    ? { ...existingChecklist, ...input.checklist }
    : existingChecklist;

  const updated = await prisma.installation.update({
    where: { id: inst.id },
    data: {
      checklist: mergedChecklist,
      installed_capacity_kw: input.installedCapacityKw || inst.installed_capacity_kw,
      test_reading_w: input.testReadingW || inst.test_reading_w,
    },
  });

  return {
    installationId: updated.id,
    checklist: updated.checklist,
    installedCapacityKw: updated.installed_capacity_kw ? Number(updated.installed_capacity_kw) : null,
    testReadingW: updated.test_reading_w ? Number(updated.test_reading_w) : null,
  };
}

/**
 * Places installation job on hold with mandatory reason.
 */
export async function holdInstallation(data: {
  installationId: string;
  holdReason: string;
  actorId?: string;
}) {
  if (!data.holdReason?.trim()) {
    throw new AppError('HOLD_REASON_REQUIRED', 'A mandatory reason is required to place installation on hold', 400);
  }

  let actorId = data.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }

  return prisma.$transaction(async (tx) => {
    const inst = await tx.installation.findUnique({
      where: { id: data.installationId },
    });
    if (!inst) {
      throw new AppError('NOT_FOUND', 'Installation not found', 404);
    }
    if (inst.status === InstallationStatus.COMPLETED) {
      throw new AppError('INVALID_STATE', 'Cannot hold completed installation', 400);
    }

    const updated = await tx.installation.update({
      where: { id: inst.id },
      data: {
        status: InstallationStatus.ON_HOLD,
        hold_reason: data.holdReason.trim(),
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'INSTALLATION',
        entityId: inst.id,
        action: 'INSTALLATION_HELD',
        after: { holdReason: data.holdReason.trim() },
      },
      tx
    );

    return {
      installationId: updated.id,
      status: updated.status,
      holdReason: updated.hold_reason,
    };
  });
}

/**
 * Resumes an on-hold installation.
 */
export async function resumeInstallation(data: { installationId: string; actorId?: string }) {
  let actorId = data.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }

  return prisma.$transaction(async (tx) => {
    const inst = await tx.installation.findUnique({
      where: { id: data.installationId },
    });
    if (!inst) {
      throw new AppError('NOT_FOUND', 'Installation not found', 404);
    }
    if (inst.status !== InstallationStatus.ON_HOLD) {
      throw new AppError('INVALID_STATE', `Only ON_HOLD jobs can be resumed (current: ${inst.status})`, 400);
    }

    const updated = await tx.installation.update({
      where: { id: inst.id },
      data: {
        status: InstallationStatus.IN_PROGRESS,
        hold_reason: null,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'INSTALLATION',
        entityId: inst.id,
        action: 'INSTALLATION_RESUMED',
      },
      tx
    );

    return {
      installationId: updated.id,
      status: updated.status,
    };
  });
}

/**
 * Final installation customer sign-off & commissioning:
 * - Guard 1: Mandatory checklist (stands, panels, wiring, earthing, power test) -> CHECKLIST_INCOMPLETE
 * - Guard 2: Minimum 3 photo attachments (array, inverter, earthing) -> PHOTOS_REQUIRED
 * - Guard 3: Customer signature and full name
 * - Computes cryptographic proof hash (signoff_hash)
 * - Activates commissioning equipment warranties (INSTALLATION_SIGNOFF)
 * - Generates 5-year workmanship warranty
 * - Issues 90-day certificate access token
 * - Transitions order to INSTALLED
 * (Spec 6.3 Phase 6, PRD C8, ADR D5, D11)
 */
export async function signOffInstallation(input: SignOffInput) {
  // Guard 1: Checklist Completeness
  const c = input.checklist;
  if (
    !c ||
    !c.standsMounted ||
    !c.panelsLaid ||
    !c.wiringConnected ||
    !c.earthingDone ||
    !c.generationTested
  ) {
    throw new AppError(
      'CHECKLIST_INCOMPLETE',
      'All mandatory checklist items (standsMounted, panelsLaid, wiringConnected, earthingDone, generationTested) must be completed before customer sign-off',
      400
    );
  }

  // Guard 2: Minimum 3 Photos Required
  if (!input.photoAttachmentIds || input.photoAttachmentIds.length < 3) {
    throw new AppError(
      'PHOTOS_REQUIRED',
      'At least 3 photos (array, inverter, earthing) are required for customer sign-off',
      400
    );
  }

  // Guard 3: Customer Signature & Name
  if (!input.signedName?.trim() || !input.signatureAttachmentId) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Customer name and signature attachment are required for sign-off',
      400
    );
  }

  // Guard 4: Test Readings
  if (input.installedCapacityKw <= 0 || input.testReadingW <= 0) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Installed capacity (kW) and test generation reading (W) must be positive values',
      400
    );
  }

  let actorId = input.actorId;
  if (!actorId) {
    const defaultUser = await prisma.user.findFirst();
    if (defaultUser) actorId = defaultUser.id;
  }
  if (!actorId) {
    throw new AppError('UNAUTHENTICATED', 'User not authenticated', 401);
  }

  const now = new Date();
  const signoffDateStr = now.toISOString().split('T')[0];

  return prisma.$transaction(async (tx) => {
    const inst = await tx.installation.findUnique({
      where: { id: input.installationId },
      include: {
        order: {
          include: { customer: true },
        },
      },
    });

    if (!inst) {
      throw new AppError('NOT_FOUND', 'Installation record not found', 404);
    }

    if (inst.status === InstallationStatus.COMPLETED) {
      throw new AppError('INVALID_STATE', 'Installation has already been signed off', 409);
    }

    // 1. Gather all serialized inventory units linked to this installation or order
    const units = await tx.inventoryUnit.findMany({
      where: {
        OR: [
          { installation_id: inst.id },
          { order_id: inst.order_id },
        ],
      },
      include: { product: true },
    });

    const serialList = units.map((u) => u.serial_number).sort().join(',');

    // 2. Generate cryptographic SHA-256 signoff proof hash
    const signoffHash = computeSignoffHash({
      installationId: inst.id,
      signedName: input.signedName,
      installedCapacityKw: input.installedCapacityKw,
      testReadingW: input.testReadingW,
      serialList,
      timestamp: now.toISOString(),
    });

    // 3. Issue 90-day Certificate Access Token
    const certToken = generateAccessToken('CERTIFICATE');
    await tx.customerAccessLink.create({
      data: {
        token_hash: certToken.tokenHash,
        customer_id: inst.order.customer_id,
        scope: 'CERTIFICATE',
        expires_at: certToken.expiresAt,
      },
    });

    // 4. Update Installation to COMPLETED
    const updatedInst = await tx.installation.update({
      where: { id: inst.id },
      data: {
        status: InstallationStatus.COMPLETED,
        finished_at: now,
        signed_name: input.signedName.trim(),
        signed_at: now,
        signature_attachment_id: input.signatureAttachmentId,
        signoff_hash: signoffHash,
        certificate_token_hash: certToken.tokenHash,
        checklist: input.checklist,
        installed_capacity_kw: input.installedCapacityKw,
        test_reading_w: input.testReadingW,
      },
    });

    // 5. Bind photo attachments to this installation
    await tx.attachment.updateMany({
      where: { id: { in: input.photoAttachmentIds } },
      data: {
        owner_type: AttachmentOwnerType.INSTALLATION,
        owner_id: inst.id,
      },
    });

    // 6. Transition units to INSTALLED
    if (units.length > 0) {
      await tx.inventoryUnit.updateMany({
        where: { id: { in: units.map((u) => u.id) } },
        data: {
          status: UnitStatus.INSTALLED,
          installation_id: inst.id,
        },
      });
    }

    // 7. Automated Warranty Generation:
    // a. Equipment warranties with INSTALLATION_SIGNOFF start basis
    const createdWarranties: Array<{
      id: string;
      coverage: WarrantyCoverage;
      startDate: string;
      endDate: string;
      months: number;
    }> = [];

    for (const unit of units) {
      const existing = await tx.warranty.findFirst({
        where: { unit_id: unit.id, status: WarrantyStatus.ACTIVE },
      });

      if (!existing && unit.product.warranty_months > 0) {
        const period = calculateWarrantyPeriod({
          startBasis: 'INSTALLATION_SIGNOFF',
          commissioningDate: signoffDateStr,
          months: unit.product.warranty_months,
        });

        const w = await tx.warranty.create({
          data: {
            unit_id: unit.id,
            installation_id: inst.id,
            customer_id: inst.order.customer_id,
            product_id: unit.product_id,
            coverage: WarrantyCoverage.EQUIPMENT,
            start_date: new Date(period.startDate),
            end_date: new Date(period.endDate),
            months: period.months,
            status: WarrantyStatus.ACTIVE,
            source: WarrantySource.SIGN_OFF,
          },
        });

        createdWarranties.push({
          id: w.id,
          coverage: w.coverage,
          startDate: period.startDate,
          endDate: period.endDate,
          months: period.months,
        });
      }
    }

    // b. 5-Year Workmanship Warranty for the overall system
    const workmanshipPeriod = calculateWarrantyPeriod({
      startBasis: 'INSTALLATION_SIGNOFF',
      commissioningDate: signoffDateStr,
      months: 60, // 5 years
    });

    const workmanshipWarranty = await tx.warranty.create({
      data: {
        installation_id: inst.id,
        customer_id: inst.order.customer_id,
        coverage: WarrantyCoverage.WORKMANSHIP,
        start_date: new Date(workmanshipPeriod.startDate),
        end_date: new Date(workmanshipPeriod.endDate),
        months: 60,
        status: WarrantyStatus.ACTIVE,
        source: WarrantySource.SIGN_OFF,
      },
    });

    createdWarranties.push({
      id: workmanshipWarranty.id,
      coverage: workmanshipWarranty.coverage,
      startDate: workmanshipPeriod.startDate,
      endDate: workmanshipPeriod.endDate,
      months: 60,
    });

    // 8. Update Order status to INSTALLED
    await tx.order.update({
      where: { id: inst.order_id },
      data: {
        status: OrderStatus.INSTALLED,
      },
    });

    // 9. Close open time logs
    await tx.timeLog.updateMany({
      where: {
        installation_id: inst.id,
        started_at: { equals: tx.timeLog.fields.ended_at as any },
      },
      data: {
        ended_at: now,
      },
    });

    // 10. Record immutable audit log
    await recordAudit(
      {
        actorType: 'USER',
        actorId: actorId!,
        entityType: 'INSTALLATION',
        entityId: inst.id,
        action: 'INSTALLATION_SIGNED_OFF',
        after: {
          installedCapacityKw: input.installedCapacityKw,
          testReadingW: input.testReadingW,
          signedName: input.signedName.trim(),
          signoffHash,
          warrantiesCount: createdWarranties.length,
          certificateTokenIssued: true,
        },
      },
      tx
    );

    // 11. Queue completion notification to the customer (AUTO-10).
    // The certificate link embeds the customer's own CERTIFICATE access token,
    // which is issued precisely to be shared with them (D11 / 90-day validity).
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || '';
    const certificatePath = `/certificate/${certToken.rawToken}`;
    const certificateUrl = baseUrl ? `${baseUrl}${certificatePath}` : certificatePath;
    const completionMessage =
      `Dear ${inst.order.customer.name}, your rooftop solar installation (order ${inst.order.order_number}) ` +
      `has been commissioned and signed off. Your commissioning certificate is available at ${certificateUrl}. ` +
      `Equipment and workmanship warranties are now active.`;

    // Email the certificate link when we have an address; otherwise fall back
    // to SMS so phone-only customers are still notified.
    if (inst.order.customer.email || inst.order.customer.phone) {
      await queueNotification(
        {
          channel: inst.order.customer.email ? 'EMAIL' : 'SMS',
          recipient: (inst.order.customer.email || inst.order.customer.phone)!,
          template: 'INSTALLATION_COMPLETED',
          payload: {
            customerName: inst.order.customer.name,
            orderNumber: inst.order.order_number,
            certificateUrl,
            certificatePath,
            subject: `Your solar installation is complete - Order ${inst.order.order_number}`,
            body: completionMessage,
            message: completionMessage,
          },
          // Idempotent per installation: retries/replays never double-send
          idempotencyKey: `installation-completed:${inst.id}`,
        },
        tx
      );
    }

    return {
      installationId: updatedInst.id,
      status: updatedInst.status,
      signedName: updatedInst.signed_name,
      signedAt: updatedInst.signed_at?.toISOString(),
      signoffHash,
      certificateRawToken: certToken.rawToken,
      certificateUrl: `/certificate/${certToken.rawToken}`,
      warranties: createdWarranties,
    };
  });
}
