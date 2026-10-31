import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { getNextSequence } from '@/lib/sequences';
import { generateBom } from '@/domain/bom';
import { calculateMargin } from '@/domain/margin';
import { validateTransition } from '@/domain/state-machines/transitions';
import { QuoteStatus, LeadStatus, OrderStatus, SystemType } from '@prisma/client';
import { rupeesToPaise } from '@/lib/money';
import { hashToken } from '@/lib/access-links';
import { getTargetMarginBp } from '@/services/settings';
import crypto from 'crypto';

export interface CreateQuoteDto {
  leadId: string;
  templateId: string;
  capacityKw: number;
  cableDistanceM?: number;
  discountRupees?: number;
  validDays?: number;
}

export async function createQuote(data: CreateQuoteDto, user?: { id: string; role: string }) {
  // FR-3.8: target margin is configurable via the settings service (default 2000 bp).
  const targetMarginBp = await getTargetMarginBp();

  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: data.leadId },
      include: { customer: true, survey: true },
    });
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found', 404);

    // Rule: Quote cannot be sent/created without approved survey unless draft
    if (lead.status !== LeadStatus.SURVEY_APPROVED && lead.status !== LeadStatus.QUOTED) {
      // Allow draft if survey completed, but flag warning
    }

    const template = await tx.systemTemplate.findUnique({
      where: { id: data.templateId },
      include: {
        bom_lines: {
          include: { product: true },
        },
      },
    });
    if (!template) throw new AppError('NOT_FOUND', 'Template not found', 404);

    // Cable distance from survey or template
    const cableDistanceM = data.cableDistanceM ?? (lead.survey?.cable_distance_m ? Number(lead.survey.cable_distance_m) : Number(template.default_cable_distance_m));

    // Generate BOM
    const bomResult = generateBom(template as any, {
      capacityKw: data.capacityKw,
      cableDistanceM,
    });

    const subtotalPaise = bomResult.subtotalPaise;
    const discountPaise = data.discountRupees ? rupeesToPaise(data.discountRupees) : 0n;

    // Check 5% discount limit for sales (Q5 / FR-3.4)
    const discountPercent = Number(subtotalPaise > 0n ? (discountPaise * 100n) / subtotalPaise : 0n);
    if (user?.role === 'SALES' && discountPercent > 5) {
      throw new AppError(
        'DISCOUNT_NEEDS_APPROVAL',
        `Sales discount of ${discountPercent}% exceeds maximum 5% authority. Director approval required.`,
        422
      );
    }
    // FR-3.4: a DIRECTOR applying a discount above the sales limit IS the
    // approving authority - stamp discount_approved_by on the quote.
    const discountApprovedBy = user && user.role !== 'SALES' && discountPercent > 5 ? user.id : null;

    const netPricePaise = subtotalPaise - discountPaise;

    // Calculate tax per line
    let totalTaxPaise = 0n;
    const quoteLinesData = bomResult.lines.map((line, idx) => {
      const lineTax = BigInt(Math.round((Number(line.lineTotalPaise) * line.taxRateBp) / 10000));
      totalTaxPaise += lineTax;
      return {
        product_id: line.productId,
        description: line.description,
        qty: line.qty,
        unit_price_paise: line.unitPricePaise,
        tax_rate_bp: line.taxRateBp,
        line_total_paise: line.lineTotalPaise,
        rule: line.rule,
        sort_order: idx,
      };
    });

    const totalPaise = netPricePaise + totalTaxPaise;

    // Indicative Subsidy Estimate (FR-3.3: e.g. PM Surya Ghar Rs 78,000 for 3 kW)
    let subsidyEstimatePaise = 0n;
    if (lead.wants_subsidy) {
      if (data.capacityKw >= 3) {
        subsidyEstimatePaise = 7800000n; // Rs 78,000
      } else if (data.capacityKw >= 2) {
        subsidyEstimatePaise = 6000000n; // Rs 60,000
      } else if (data.capacityKw >= 1) {
        subsidyEstimatePaise = 3000000n; // Rs 30,000
      }
    }

    // Margin estimation
    const margin = calculateMargin({
      netPricePaise,
      totalBomCostPaise: bomResult.totalCostPaise,
      labourAllowancePaise: template.labour_allowance_paise,
      targetMarginBp,
    });

    const quoteNumber = await getNextSequence('quote', undefined, tx);
    const validUntil = new Date(Date.now() + (data.validDays || 15) * 24 * 60 * 60 * 1000);

    // Create quote
    const quote = await tx.quote.create({
      data: {
        quote_number: quoteNumber,
        lead_id: lead.id,
        customer_id: lead.customer_id,
        template_id: template.id,
        version: 1,
        status: QuoteStatus.DRAFT,
        capacity_kw: data.capacityKw,
        system_type: template.system_type,
        cable_distance_m: cableDistanceM,
        subtotal_paise: subtotalPaise,
        discount_paise: discountPaise,
        tax_paise: totalTaxPaise,
        total_paise: totalPaise,
        subsidy_estimate_paise: subsidyEstimatePaise,
        estimated_margin_bp: margin.estimatedMarginBp,
        margin_warning: margin.marginWarning,
        discount_approved_by: discountApprovedBy,
        valid_until: validUntil,
        created_by: user?.id || null,
        lines: {
          create: quoteLinesData,
        },
      },
      include: {
        lines: true,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: user?.id,
        entityType: 'QUOTE',
        entityId: quote.id,
        action: 'QUOTE_CREATED',
        after: { quoteNumber, totalPaise: totalPaise.toString(), marginWarning: margin.marginWarning, discountApprovedBy },
      },
      tx
    );

    return quote;
  });
}

export async function sendQuote(quoteId: string, user?: { id: string; role: string }) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { lead: true, customer: true },
    });
    if (!quote) throw new AppError('NOT_FOUND', 'Quote not found', 404);

    // Enforce survey approved before sending (FR-2.4)
    if (quote.lead.status !== LeadStatus.SURVEY_APPROVED && quote.lead.status !== LeadStatus.QUOTED) {
      throw new AppError(
        'SURVEY_NOT_APPROVED',
        'Cannot send quotation to customer before site survey is approved.',
        422
      );
    }

    // Generate secure public token hash
    const rawToken = crypto.randomBytes(16).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const updated = await tx.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.SENT,
        sent_at: new Date(),
        public_token_hash: tokenHash,
      },
    });

    // Populate customer_access_links record (D11: quote validity + 30 days)
    const validUntilDate = new Date(quote.valid_until);
    const validDays = Math.max(1, Math.ceil((validUntilDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    const linkExpiresAt = new Date(Date.now() + (validDays + 30) * 24 * 60 * 60 * 1000);

    await tx.customerAccessLink.create({
      data: {
        customer_id: quote.customer_id,
        scope: 'QUOTE',
        token_hash: tokenHash,
        expires_at: linkExpiresAt,
        created_by: user?.id || null,
      },
    });

    await tx.lead.update({
      where: { id: quote.lead_id },
      data: { status: LeadStatus.QUOTED },
    });

    // Write transactional outbox notification
    await tx.outbox.create({
      data: {
        channel: 'SMS',
        recipient: quote.customer.phone,
        template: 'QUOTE_SENT',
        payload: {
          customerName: quote.customer.name,
          quoteNumber: quote.quote_number,
          totalAmount: Number(quote.total_paise) / 100,
          quoteLink: `/q/${rawToken}`,
        },
        idempotency_key: `quote-send-${quote.id}-${Date.now()}`,
      },
    });

    return { ...updated, rawToken };
  });
}

export async function acceptQuote(
  quoteId: string,
  data: { acceptedName: string; phoneLastFour: string; idempotencyKey: string }
) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true, lead: true, lines: true, order: true },
    });
    if (!quote) throw new AppError('NOT_FOUND', 'Quote not found', 404);

    // ── X-QUAL-IDEM: idempotent acceptance ────────────────────────────────
    // Double-submit (client retry, duplicate tab, racing webhooks) must
    // return the EXISTING order instead of creating a duplicate.
    if (quote.status === QuoteStatus.ACCEPTED && quote.order) {
      return {
        success: true,
        orderId: quote.order.id,
        orderNumber: quote.order.order_number,
        alreadyAccepted: true,
      };
    }

    // Phone verification
    const cleanPhone = quote.customer.phone.replace(/\D/g, '');
    if (!cleanPhone.endsWith(data.phoneLastFour)) {
      throw new AppError('VERIFICATION_REQUIRED', 'Phone last 4 digits did not match.', 403);
    }

    // Check expiry
    if (new Date(quote.valid_until).getTime() < Date.now()) {
      throw new AppError('LINK_EXPIRED', 'Quote validity has expired.', 410);
    }

    // Update Quote
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.ACCEPTED,
        accepted_at: new Date(),
        accepted_name: data.acceptedName,
      },
    });

    // Advance Lead
    await tx.lead.update({
      where: { id: quote.lead_id },
      data: { status: LeadStatus.WON },
    });

    // Create Order with snapshot (FR-4.1 / Section 4.1) - guarded against
    // a concurrent accept racing this transaction (orders.quote_id unique).
    const existingOrder = await tx.order.findUnique({ where: { quote_id: quote.id } });
    if (existingOrder) {
      return {
        success: true,
        orderId: existingOrder.id,
        orderNumber: existingOrder.order_number,
        alreadyAccepted: true,
      };
    }

    const orderNumber = await getNextSequence('order', undefined, tx);
    const advanceRequiredPaise = BigInt(Math.round(Number(quote.total_paise) * 0.3)); // 30% advance (A2, Q1)

    let order;
    try {
      order = await tx.order.create({
        data: {
          order_number: orderNumber,
          quote_id: quote.id,
          customer_id: quote.customer_id,
          status: OrderStatus.PENDING_ADVANCE,
          capacity_kw: quote.capacity_kw,
          system_type: quote.system_type,
          site_snapshot: {
            address: quote.customer.address,
            pincode: quote.customer.pincode,
            cableDistanceM: Number(quote.cable_distance_m),
          },
          subtotal_paise: quote.subtotal_paise,
          discount_paise: quote.discount_paise,
          tax_paise: quote.tax_paise,
          total_paise: quote.total_paise,
          advance_required_paise: advanceRequiredPaise,
          lines: {
            create: quote.lines.map((l) => ({
              product_id: l.product_id,
              description: l.description,
              qty: l.qty,
              unit_price_paise: l.unit_price_paise,
              tax_rate_bp: l.tax_rate_bp,
            })),
          },
        },
      });
    } catch (err: any) {
      // P2002 = unique violation on orders.quote_id: a concurrent request
      // already created the order for this quote. Return that order.
      if (err?.code === 'P2002') {
        const raced = await tx.order.findUnique({ where: { quote_id: quote.id } });
        if (raced) {
          return {
            success: true,
            orderId: raced.id,
            orderNumber: raced.order_number,
            alreadyAccepted: true,
          };
        }
      }
      throw err;
    }

    await recordAudit(
      {
        actorType: 'CUSTOMER',
        entityType: 'QUOTE',
        entityId: quote.id,
        action: 'QUOTE_ACCEPTED',
        after: { orderId: order.id, acceptedName: data.acceptedName },
      },
      tx
    );

    return { success: true, orderId: order.id, orderNumber };
  });
}

export async function rejectQuote(
  quoteId: string,
  data: { rejectReason: string; phoneLastFour: string; idempotencyKey?: string }
) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true, lead: true },
    });
    if (!quote) throw new AppError('NOT_FOUND', 'Quote not found', 404);

    if (quote.status === QuoteStatus.ACCEPTED) {
      throw new AppError('CONFLICT', 'Quote has already been accepted and cannot be rejected.', 409);
    }

    if (!data.rejectReason || data.rejectReason.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A reason is required when rejecting a quotation.', 422);
    }

    // Phone verification
    const cleanPhone = quote.customer.phone.replace(/\D/g, '');
    if (!cleanPhone.endsWith(data.phoneLastFour)) {
      throw new AppError('VERIFICATION_REQUIRED', 'Phone last 4 digits did not match.', 403);
    }

    // Check expiry
    if (new Date(quote.valid_until).getTime() < Date.now()) {
      throw new AppError('LINK_EXPIRED', 'Quote validity has expired.', 410);
    }

    // Update Quote
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.REJECTED,
        rejected_at: new Date(),
        reject_reason: data.rejectReason,
      },
    });

    // Lead stays QUOTED per specification (C3, Section 4.3)

    // Write transactional outbox notification to sales
    await tx.outbox.create({
      data: {
        channel: 'SMS',
        recipient: 'SALES_ALERT',
        template: 'QUOTE_REJECTED',
        payload: {
          quoteNumber: quote.quote_number,
          customerName: quote.customer.name,
          customerPhone: quote.customer.phone,
          rejectReason: data.rejectReason,
        },
        idempotency_key: data.idempotencyKey || `quote-reject-${quote.id}-${Date.now()}`,
      },
    });

    await recordAudit(
      {
        actorType: 'CUSTOMER',
        entityType: 'QUOTE',
        entityId: quote.id,
        action: 'QUOTE_REJECTED',
        after: { quoteNumber: quote.quote_number, rejectReason: data.rejectReason },
      },
      tx
    );

    return { success: true, quoteNumber: quote.quote_number, status: QuoteStatus.REJECTED };
  });
}

export async function getQuoteByPublicToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  // Check link security in customer_access_links if exists
  const link = await prisma.customerAccessLink.findUnique({
    where: { token_hash: tokenHash },
  });

  const now = Date.now();
  if (link) {
    if (new Date(link.expires_at).getTime() <= now) {
      throw new AppError('LINK_EXPIRED', 'This access link has expired.', 410);
    }
    if (link.revoked_at && new Date(link.revoked_at).getTime() <= now) {
      throw new AppError('LINK_REVOKED', 'This access link has been revoked.', 403);
    }
    if (link.locked_until && new Date(link.locked_until).getTime() > now) {
      const remainingMinutes = Math.ceil((new Date(link.locked_until).getTime() - now) / (60 * 1000));
      throw new AppError(
        'LINK_LOCKED',
        `Access link temporarily locked due to repeated verification failures. Please try again in ${remainingMinutes} minutes.`,
        429
      );
    }
  }

  // Find quote by public_token_hash
  let quote = await prisma.quote.findUnique({
    where: { public_token_hash: tokenHash },
    include: {
      customer: true,
      lead: { include: { assessment: true } },
      template: true,
      lines: {
        include: { product: true },
        orderBy: { sort_order: 'asc' },
      },
    },
  });

  // Fallback: a quote or portal link both grant the owning customer access to
  // their latest customer-visible quotation.
  if (!quote && link && (link.scope === 'QUOTE' || link.scope === 'PORTAL')) {
    quote = await prisma.quote.findFirst({
      where: {
        customer_id: link.customer_id,
        status: {
          in: [QuoteStatus.SENT, QuoteStatus.ACCEPTED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
        },
      },
      include: {
        customer: true,
        lead: { include: { assessment: true } },
        template: true,
        lines: {
          include: { product: true },
          orderBy: { sort_order: 'asc' },
        },
      },
      orderBy: { version: 'desc' },
    });
  }

  if (!quote) {
    throw new AppError('NOT_FOUND', 'Quote not found or invalid access token.', 404);
  }

  const isExpired = new Date(quote.valid_until).getTime() < now;

  return {
    quote,
    link,
    isExpired,
  };
}

export async function acceptQuoteByPublicToken(
  rawToken: string,
  data: { acceptedName: string; phoneLastFour: string; idempotencyKey?: string }
) {
  const tokenHash = hashToken(rawToken);
  const { quote, link, isExpired } = await getQuoteByPublicToken(rawToken);

  if (isExpired) {
    throw new AppError('LINK_EXPIRED', 'Quote validity has expired.', 410);
  }

  const cleanPhone = quote.customer.phone.replace(/\D/g, '');
  if (!cleanPhone.endsWith(data.phoneLastFour)) {
    const newFailures = (link?.failed_attempts || 0) + 1;
    const shouldLock = newFailures >= 5;
    const lockedUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null;

    if (link) {
      await prisma.customerAccessLink.update({
        where: { id: link.id },
        data: {
          failed_attempts: newFailures,
          locked_until: lockedUntil,
        },
      });
    }

    if (shouldLock) {
      throw new AppError(
        'LINK_LOCKED',
        'Too many failed verification attempts. Access link locked for 15 minutes.',
        429
      );
    }

    throw new AppError(
      'VERIFICATION_REQUIRED',
      `Phone last 4 digits did not match. ${5 - newFailures} attempts remaining.`,
      403
    );
  }

  // Verification passed - reset failed attempts
  if (link && link.failed_attempts > 0) {
    await prisma.customerAccessLink.update({
      where: { id: link.id },
      data: { failed_attempts: 0, locked_until: null },
    });
  }

  const result = await acceptQuote(quote.id, {
    acceptedName: data.acceptedName,
    phoneLastFour: data.phoneLastFour,
    idempotencyKey: data.idempotencyKey || `public-accept-${quote.id}-${Date.now()}`,
  });

  return result;
}

export async function rejectQuoteByPublicToken(
  rawToken: string,
  data: { rejectReason: string; phoneLastFour: string; idempotencyKey?: string }
) {
  const tokenHash = hashToken(rawToken);
  const { quote, link, isExpired } = await getQuoteByPublicToken(rawToken);

  if (isExpired) {
    throw new AppError('LINK_EXPIRED', 'Quote validity has expired.', 410);
  }

  const cleanPhone = quote.customer.phone.replace(/\D/g, '');
  if (!cleanPhone.endsWith(data.phoneLastFour)) {
    const newFailures = (link?.failed_attempts || 0) + 1;
    const shouldLock = newFailures >= 5;
    const lockedUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null;

    if (link) {
      await prisma.customerAccessLink.update({
        where: { id: link.id },
        data: {
          failed_attempts: newFailures,
          locked_until: lockedUntil,
        },
      });
    }

    if (shouldLock) {
      throw new AppError(
        'LINK_LOCKED',
        'Too many failed verification attempts. Access link locked for 15 minutes.',
        429
      );
    }

    throw new AppError(
      'VERIFICATION_REQUIRED',
      `Phone last 4 digits did not match. ${5 - newFailures} attempts remaining.`,
      403
    );
  }

  // Verification passed - reset failed attempts
  if (link && link.failed_attempts > 0) {
    await prisma.customerAccessLink.update({
      where: { id: link.id },
      data: { failed_attempts: 0, locked_until: null },
    });
  }

  const result = await rejectQuote(quote.id, {
    rejectReason: data.rejectReason,
    phoneLastFour: data.phoneLastFour,
    idempotencyKey: data.idempotencyKey || `public-reject-${quote.id}-${Date.now()}`,
  });

  return result;
}

export async function getQuotes(filters?: { leadId?: string; status?: QuoteStatus }) {
  return prisma.quote.findMany({
    where: {
      lead_id: filters?.leadId,
      status: filters?.status,
    },
    include: {
      customer: true,
      lead: true,
      lines: { include: { product: true } },
    },
    orderBy: { created_at: 'desc' },
  });
}

export async function getQuoteById(id: string) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      lead: { include: { survey: true, assessment: true } },
      template: true,
      discount_approver: { select: { id: true, name: true, role: true } },
      lines: {
        include: { product: true },
        orderBy: { sort_order: 'asc' },
      },
    },
  });

  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found', 404);
  return quote;
}

export interface ReviseQuoteDto {
  capacityKw?: number;
  cableDistanceM?: number;
  discountRupees?: number;
  validDays?: number;
}

export async function reviseQuote(
  quoteId: string,
  data: ReviseQuoteDto = {},
  user?: { id: string; role: string }
) {
  // FR-3.8: target margin is configurable via the settings service
  // (key `target_margin_bp`, default 2000 bp = 20%).
  const targetMarginBp = await getTargetMarginBp();

  return prisma.$transaction(async (tx) => {
    const oldQuote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: {
        lines: true,
        lead: true,
        template: {
          include: {
            bom_lines: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!oldQuote) throw new AppError('NOT_FOUND', 'Quote not found', 404);

    if (oldQuote.status === QuoteStatus.ACCEPTED) {
      throw new AppError('CONFLICT', 'Cannot revise an already accepted quotation', 409);
    }
    if (oldQuote.status === QuoteStatus.SUPERSEDED) {
      throw new AppError('CONFLICT', 'Cannot revise an already superseded quotation', 409);
    }

    // Mark previous quote as SUPERSEDED (version 1 becomes read-only and superseded)
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        status: QuoteStatus.SUPERSEDED,
      },
    });

    const nextVersion = oldQuote.version + 1;
    const baseNumber = oldQuote.quote_number.replace(/-v\d+$/, '');
    const newQuoteNumber = `${baseNumber}-v${nextVersion}`;

    // Calculate capacity and cable distance
    const capacityKw = data.capacityKw ?? Number(oldQuote.capacity_kw);
    const cableDistanceM = data.cableDistanceM ?? Number(oldQuote.cable_distance_m);

    // If template exists, recalculate BOM or clone existing lines
    let quoteLinesData: any[] = [];
    let subtotalPaise = 0n;
    let totalTaxPaise = 0n;
    let totalBomCostPaise = 0n;

    if (oldQuote.template) {
      const bomResult = generateBom(oldQuote.template as any, {
        capacityKw,
        cableDistanceM,
      });
      subtotalPaise = bomResult.subtotalPaise;
      totalBomCostPaise = bomResult.totalCostPaise;

      quoteLinesData = bomResult.lines.map((line, idx) => {
        const lineTax = BigInt(Math.round((Number(line.lineTotalPaise) * line.taxRateBp) / 10000));
        totalTaxPaise += lineTax;
        return {
          product_id: line.productId,
          description: line.description,
          qty: line.qty,
          unit_price_paise: line.unitPricePaise,
          tax_rate_bp: line.taxRateBp,
          line_total_paise: line.lineTotalPaise,
          rule: line.rule,
          sort_order: idx,
        };
      });
    } else {
      quoteLinesData = oldQuote.lines.map((l, idx) => {
        const lineTax = BigInt(Math.round((Number(l.line_total_paise) * l.tax_rate_bp) / 10000));
        totalTaxPaise += lineTax;
        subtotalPaise += l.line_total_paise;
        return {
          product_id: l.product_id,
          description: l.description,
          qty: l.qty,
          unit_price_paise: l.unit_price_paise,
          tax_rate_bp: l.tax_rate_bp,
          line_total_paise: l.line_total_paise,
          rule: l.rule,
          is_manual: l.is_manual,
          manual_reason: l.manual_reason,
          sort_order: idx,
        };
      });
    }

    const discountPaise = data.discountRupees !== undefined
      ? rupeesToPaise(data.discountRupees)
      : oldQuote.discount_paise;

    // Check 5% discount limit for sales (Q5 / FR-3.4)
    const discountPercent = Number(subtotalPaise > 0n ? (discountPaise * 100n) / subtotalPaise : 0n);
    if (user?.role === 'SALES' && discountPercent > 5) {
      throw new AppError(
        'DISCOUNT_NEEDS_APPROVAL',
        `Sales discount of ${discountPercent}% exceeds maximum 5% authority. Director approval required.`,
        422
      );
    }
    // FR-3.4: when a DIRECTOR applies a discount above the sales limit via a
    // revision ("Approve discount & revise"), record them as the approver.
    // Below-limit revisions inherit the previous approval stamp, if any.
    const discountApprovedBy =
      user && user.role !== 'SALES' && discountPercent > 5
        ? user.id
        : discountPercent <= 5
        ? oldQuote.discount_approved_by
        : null;

    const netPricePaise = subtotalPaise - discountPaise;
    const totalPaise = netPricePaise + totalTaxPaise;

    // Margin estimation
    const margin = calculateMargin({
      netPricePaise,
      totalBomCostPaise,
      labourAllowancePaise: oldQuote.template?.labour_allowance_paise,
      targetMarginBp,
    });

    const validUntil = new Date(Date.now() + (data.validDays || 15) * 24 * 60 * 60 * 1000);

    const newQuote = await tx.quote.create({
      data: {
        quote_number: newQuoteNumber,
        lead_id: oldQuote.lead_id,
        customer_id: oldQuote.customer_id,
        template_id: oldQuote.template_id,
        version: nextVersion,
        supersedes_id: oldQuote.id,
        status: QuoteStatus.DRAFT,
        capacity_kw: capacityKw,
        system_type: oldQuote.system_type,
        cable_distance_m: cableDistanceM,
        subtotal_paise: subtotalPaise,
        discount_paise: discountPaise,
        tax_paise: totalTaxPaise,
        total_paise: totalPaise,
        subsidy_estimate_paise: oldQuote.subsidy_estimate_paise,
        estimated_margin_bp: margin.estimatedMarginBp,
        margin_warning: margin.marginWarning,
        discount_approved_by: discountApprovedBy,
        valid_until: validUntil,
        created_by: user?.id || null,
        lines: {
          create: quoteLinesData,
        },
      },
      include: {
        lines: true,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: user?.id,
        entityType: 'QUOTE',
        entityId: newQuote.id,
        action: 'QUOTE_REVISED',
        after: {
          newQuoteNumber,
          version: nextVersion,
          supersededQuoteId: oldQuote.id,
          discountApprovedBy,
        },
      },
      tx
    );

    return newQuote;
  });
}

export async function updateQuoteLine(
  quoteId: string,
  data: { lineId: string; qty: number; manualReason: string },
  user?: { id: string; role: string }
) {
  // FR-3.8: configurable target margin (default 2000 bp).
  const targetMarginBp = await getTargetMarginBp();

  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: {
        lines: { include: { product: true } },
        template: true,
      },
    });

    if (!quote) throw new AppError('NOT_FOUND', 'Quote not found', 404);

    if (quote.status === QuoteStatus.SUPERSEDED || quote.status === QuoteStatus.ACCEPTED) {
      throw new AppError(
        'CONFLICT',
        `Cannot edit lines of quote in ${quote.status} status. Only active DRAFT quotes can be edited.`,
        409
      );
    }

    if (!data.manualReason || data.manualReason.trim().length === 0) {
      throw new AppError('VALIDATION_FAILED', 'A reason is required when manually modifying quantities.', 422);
    }

    const line = quote.lines.find((l) => l.id === data.lineId);
    if (!line) throw new AppError('NOT_FOUND', 'Quote line not found', 404);

    const newQty = data.qty;
    const newLineTotalPaise = BigInt(Math.round(newQty * Number(line.unit_price_paise)));

    await tx.quoteLine.update({
      where: { id: data.lineId },
      data: {
        qty: newQty,
        rule: 'MANUAL',
        is_manual: true,
        manual_reason: data.manualReason,
        line_total_paise: newLineTotalPaise,
      },
    });

    // Recalculate totals across all lines
    const allLines = quote.lines.map((l) =>
      l.id === data.lineId ? { ...l, qty: newQty, line_total_paise: newLineTotalPaise } : l
    );

    let subtotalPaise = 0n;
    let totalTaxPaise = 0n;
    let totalBomCostPaise = 0n;

    for (const l of allLines) {
      subtotalPaise += l.line_total_paise;
      const lineTax = BigInt(Math.round((Number(l.line_total_paise) * l.tax_rate_bp) / 10000));
      totalTaxPaise += lineTax;
      totalBomCostPaise += BigInt(Math.round(Number(l.qty) * Number(l.product.std_cost_paise)));
    }

    const netPricePaise = subtotalPaise - quote.discount_paise;
    const totalPaise = netPricePaise + totalTaxPaise;

    const margin = calculateMargin({
      netPricePaise,
      totalBomCostPaise,
      labourAllowancePaise: quote.template?.labour_allowance_paise,
      targetMarginBp,
    });

    const updatedQuote = await tx.quote.update({
      where: { id: quoteId },
      data: {
        subtotal_paise: subtotalPaise,
        tax_paise: totalTaxPaise,
        total_paise: totalPaise,
        estimated_margin_bp: margin.estimatedMarginBp,
        margin_warning: margin.marginWarning,
      },
      include: {
        lines: true,
      },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: user?.id,
        entityType: 'QUOTE',
        entityId: quote.id,
        action: 'QUOTE_LINE_MODIFIED',
        after: {
          lineId: data.lineId,
          qty: newQty,
          reason: data.manualReason,
          newTotalPaise: totalPaise.toString(),
        },
      },
      tx
    );

    return updatedQuote;
  });
}

