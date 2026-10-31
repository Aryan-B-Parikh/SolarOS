import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiHandler } from '@/lib/handler';
import { prisma } from '@/lib/db';
import { recordAudit } from '@/lib/audit';

const PRODUCT_CATEGORIES = [
  'SOLAR_PANEL',
  'INVERTER',
  'BATTERY',
  'CHARGE_CONTROLLER',
  'STRUCTURE',
  'CABLE',
  'ACDB',
  'DCDB',
  'EARTHING',
  'LIGHTNING_ARRESTER',
  'CONNECTOR',
  'ACCESSORY',
  'SERVICE',
] as const;

const ProductQuerySchema = z.object({
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  includeInactive: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

const CreateProductSchema = z.object({
  sku: z.string().min(2, 'SKU is required').max(64),
  name: z.string().min(2, 'Product name is required').max(200),
  category: z.enum(PRODUCT_CATEGORIES),
  brand: z.string().max(120).default(''),
  model: z.string().max(120).default(''),
  uom: z.string().max(16).default('NOS'),
  is_serialized: z.boolean().default(false),
  warranty_months: z.number().int().min(0).max(360).default(0),
  warranty_start_basis: z.enum(['DELIVERY', 'INSTALLATION_SIGNOFF']).default('DELIVERY'),
  rated_power_w: z.number().int().positive().nullish(),
  hsn_code: z.string().max(20).nullish(),
  tax_rate_bp: z.number().int().min(0).max(10000).default(1800),
  std_cost_paise: z.number().int().min(0).default(0),
  sale_price_paise: z.number().int().min(0).default(0),
  reorder_level: z.number().min(0).default(0),
  monitoring_url: z.string().url('Monitoring URL must be a valid URL').nullish().or(z.literal('')),
  is_active: z.boolean().default(true),
});

/** Product catalogue list (FR-5.1). Optional category filter. */
export const GET = createApiHandler(
  {
    querySchema: ProductQuerySchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'SALES', 'TECHNICIAN', 'SUPPORT', 'ACCOUNTS'],
  },
  async ({ query }) => {
    const products = await prisma.product.findMany({
      where: {
        category: query?.category,
        ...(query?.includeInactive ? {} : { is_active: true }),
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(
      products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        brand: p.brand,
        model: p.model,
        uom: p.uom,
        is_serialized: p.is_serialized,
        warranty_months: p.warranty_months,
        warranty_start_basis: p.warranty_start_basis,
        rated_power_w: p.rated_power_w,
        hsn_code: p.hsn_code,
        tax_rate_bp: p.tax_rate_bp,
        std_cost_paise: Number(p.std_cost_paise),
        sale_price_paise: Number(p.sale_price_paise),
        reorder_level: Number(p.reorder_level),
        monitoring_url: p.monitoring_url,
        is_active: p.is_active,
      }))
    );
  }
);

/** Product catalogue create (FR-5.1). */
export const POST = createApiHandler(
  {
    bodySchema: CreateProductSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ body, user }) => {
    const existing = await prisma.product.findUnique({ where: { sku: body.sku } });
    if (existing) {
      return NextResponse.json(
        {
          error: {
            code: 'CONFLICT',
            message: `A product with SKU ${body.sku} already exists`,
          },
        },
        { status: 409 }
      );
    }

    const product = await prisma.product.create({
      data: {
        sku: body.sku.trim(),
        name: body.name.trim(),
        category: body.category,
        brand: body.brand?.trim() || '',
        model: body.model?.trim() || '',
        uom: body.uom || 'NOS',
        is_serialized: body.is_serialized,
        warranty_months: body.warranty_months,
        warranty_start_basis: body.warranty_start_basis,
        rated_power_w: body.rated_power_w ?? null,
        hsn_code: body.hsn_code ?? null,
        tax_rate_bp: body.tax_rate_bp,
        std_cost_paise: BigInt(body.std_cost_paise),
        sale_price_paise: BigInt(body.sale_price_paise),
        reorder_level: body.reorder_level,
        monitoring_url: body.monitoring_url || null,
        is_active: body.is_active,
      },
    });

    await recordAudit({
      actorType: 'USER',
      actorId: user?.id,
      entityType: 'PRODUCT',
      entityId: product.id,
      action: 'PRODUCT_CREATED',
      after: {
        sku: product.sku,
        name: product.name,
        category: product.category,
        isSerialized: product.is_serialized,
      },
    });

    return NextResponse.json(
      {
        id: product.id,
        sku: product.sku,
        name: product.name,
      },
      { status: 201 }
    );
  }
);
