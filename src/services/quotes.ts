import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { getNextSequence } from '@/lib/sequences';
import { generateBom } from '@/domain/bom';
import { calculateMargin } from '@/domain/margin';
import { validateTransition } from '@/domain/state-machines/transitions';
import { QuoteStatus, LeadStatus, OrderStatus, SystemType } from '@prisma/client';
import { rupeesToPaise } from '@/lib/money';
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
      targetMarginBp: 2000, // 20%
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
        after: { quoteNumber, totalPaise: totalPaise.toString(), marginWarning: margin.marginWarning },
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
      include: { customer: true, lead: true, lines: true },
    });
    if (!quote) throw new AppError('NOT_FOUND', 'Quote not found', 404);

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

    // Create Order with snapshot (FR-4.1 / Section 4.1)
    const orderNumber = await getNextSequence('order', undefined, tx);
    const advanceRequiredPaise = BigInt(Math.round(Number(quote.total_paise) * 0.3)); // 30% advance (A2, Q1)

    const order = await tx.order.create({
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
      lines: {
        include: { product: true },
        orderBy: { sort_order: 'asc' },
      },
    },
  });

  if (!quote) throw new AppError('NOT_FOUND', 'Quote not found', 404);
  return quote;
}

