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

const UpdateProductSchema = z.object({
  sku: z.string().min(2).max(64).optional(),
  name: z.string().min(2).max(200).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  brand: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  uom: z.string().max(16).optional(),
  is_serialized: z.boolean().optional(),
  warranty_months: z.number().int().min(0).max(360).optional(),
  warranty_start_basis: z.enum(['DELIVERY', 'INSTALLATION_SIGNOFF']).optional(),
  rated_power_w: z.number().int().positive().nullish(),
  hsn_code: z.string().max(20).nullish(),
  tax_rate_bp: z.number().int().min(0).max(10000).optional(),
  std_cost_paise: z.number().int().min(0).optional(),
  sale_price_paise: z.number().int().min(0).optional(),
  reorder_level: z.number().min(0).optional(),
  monitoring_url: z.string().url('Monitoring URL must be a valid URL').nullish().or(z.literal('')),
  is_active: z.boolean().optional(),
});

/** Product catalogue edit (FR-5.1). */
export const PATCH = createApiHandler(
  {
    bodySchema: UpdateProductSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ req, body, user }) => {
    const url = new URL(req.url);
    const parts = url.pathname.split('/');
    const productId = parts[parts.indexOf('products') + 1];

    const before = await prisma.product.findUnique({ where: { id: productId } });
    if (!before) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Product not found' } },
        { status: 404 }
      );
    }

    if (body.sku && body.sku !== before.sku) {
      const skuClash = await prisma.product.findUnique({ where: { sku: body.sku } });
      if (skuClash) {
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
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        sku: body.sku?.trim(),
        name: body.name?.trim(),
        category: body.category,
        brand: body.brand !== undefined ? body.brand.trim() : undefined,
        model: body.model !== undefined ? body.model.trim() : undefined,
        uom: body.uom,
        is_serialized: body.is_serialized,
        warranty_months: body.warranty_months,
        warranty_start_basis: body.warranty_start_basis,
        rated_power_w: body.rated_power_w === undefined ? undefined : (body.rated_power_w ?? null),
        hsn_code: body.hsn_code === undefined ? undefined : (body.hsn_code ?? null),
        tax_rate_bp: body.tax_rate_bp,
        std_cost_paise: body.std_cost_paise !== undefined ? BigInt(body.std_cost_paise) : undefined,
        sale_price_paise:
          body.sale_price_paise !== undefined ? BigInt(body.sale_price_paise) : undefined,
        reorder_level: body.reorder_level,
        monitoring_url: body.monitoring_url === undefined ? undefined : (body.monitoring_url || null),
        is_active: body.is_active,
      },
    });

    await recordAudit({
      actorType: 'USER',
      actorId: user?.id,
      entityType: 'PRODUCT',
      entityId: product.id,
      action: 'PRODUCT_UPDATED',
      before: {
        sku: before.sku,
        name: before.name,
        category: before.category,
        isSerialized: before.is_serialized,
        stdCostPaise: Number(before.std_cost_paise),
        salePricePaise: Number(before.sale_price_paise),
        reorderLevel: Number(before.reorder_level),
        isActive: before.is_active,
      },
      after: {
        sku: product.sku,
        name: product.name,
        category: product.category,
        isSerialized: product.is_serialized,
        stdCostPaise: Number(product.std_cost_paise),
        salePricePaise: Number(product.sale_price_paise),
        reorderLevel: Number(product.reorder_level),
        isActive: product.is_active,
      },
    });

    return NextResponse.json({
      id: product.id,
      sku: product.sku,
      name: product.name,
    });
  }
);
