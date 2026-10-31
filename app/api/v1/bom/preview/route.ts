import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { prisma } from '@/lib/db';
import { generateBom } from '@/domain/bom';
import { BomPreviewSchema } from '@/contracts';
import { AppError } from '@/lib/errors';

export const POST = createApiHandler(
  {
    bodySchema: BomPreviewSchema,
    allowedRoles: ['DIRECTOR', 'SALES'],
  },
  async ({ body }) => {
    const template = await prisma.systemTemplate.findUnique({
      where: { id: body.templateId },
      include: {
        bom_lines: {
          include: { product: true },
        },
      },
    });

    if (!template) throw new AppError('NOT_FOUND', 'Template not found', 404);

    const result = generateBom(template as any, {
      capacityKw: body.capacityKw,
      cableDistanceM: body.cableDistanceM,
    });

    return NextResponse.json({
      preview: {
        ...result,
        subtotalPaise: result.subtotalPaise.toString(),
        totalCostPaise: result.totalCostPaise.toString(),
        lines: result.lines.map((l) => ({
          ...l,
          unitPricePaise: l.unitPricePaise.toString(),
          unitCostPaise: l.unitCostPaise.toString(),
          lineTotalPaise: l.lineTotalPaise.toString(),
          lineCostPaise: l.lineCostPaise.toString(),
        })),
      },
    });
  }
);
