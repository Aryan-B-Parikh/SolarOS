// Template edit (FR-9.2): rename / activate / deactivate, adjust meta (labour
// allowance, default cable distance, price override) and replace the BOM lines
// with their quantity rules (FIXED, PANEL_COUNT, PER_PANEL, PER_KW,
// PER_CABLE_METER). The template version bumps on every BOM change and the
// whole edit is audited with before/after snapshots.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handlerWithSchema } from '@/lib/api'
import { requireCapability } from '@/lib/auth'
import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit } from '@/lib/outbox'

const lineSchema = z.object({
  productId: z.string(),
  rule: z.enum(['FIXED', 'PANEL_COUNT', 'PER_PANEL', 'PER_KW', 'PER_CABLE_METER']),
  value: z.number().min(0).default(1),
  allowance: z.number().min(0).default(0),
  sortOrder: z.number().int().min(0).default(0),
})

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  isActive: z.boolean().optional(),
  defaultCableDistanceM: z.number().min(0).max(5000).optional(),
  labourAllowancePaise: z.number().int().min(0).optional(),
  priceOverridePaise: z.number().int().min(0).nullable().optional(),
  lines: z.array(lineSchema).optional(),
})

interface LineSnapshot {
  productId: string
  rule: string
  value: number
  allowance: number
  sortOrder: number
}

const bySort = (a: LineSnapshot, b: LineSnapshot) => a.sortOrder - b.sortOrder

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return handlerWithSchema(req, schema, async ({ body }) => {
    const actor = await requireCapability('templates.write')
    const template = await db.systemTemplate.findUnique({ where: { id }, include: { bomLines: true } })
    if (!template) throw new AppError('NOT_FOUND', 'Template not found.')

    const before = {
      name: template.name,
      isActive: template.isActive,
      defaultCableDistanceM: template.defaultCableDistanceM,
      labourAllowancePaise: template.labourAllowancePaise,
      priceOverridePaise: template.priceOverridePaise,
      lines: template.bomLines
        .map((l) => ({ productId: l.productId, rule: l.rule, value: l.value, allowance: l.allowance, sortOrder: l.sortOrder }))
        .sort(bySort) as LineSnapshot[],
    }

    const meta: {
      name?: string; isActive?: boolean; defaultCableDistanceM?: number
      labourAllowancePaise?: number; priceOverridePaise?: number | null; version?: number
    } = {}
    if (body.name !== undefined) meta.name = body.name.trim()
    if (body.isActive !== undefined) meta.isActive = body.isActive
    if (body.defaultCableDistanceM !== undefined) meta.defaultCableDistanceM = body.defaultCableDistanceM
    if (body.labourAllowancePaise !== undefined) meta.labourAllowancePaise = body.labourAllowancePaise
    if (body.priceOverridePaise !== undefined) meta.priceOverridePaise = body.priceOverridePaise

    let linesAfter: LineSnapshot[] = before.lines
    if (body.lines !== undefined) {
      const ids = body.lines.map((l) => l.productId)
      if (new Set(ids).size !== ids.length) {
        throw new AppError('VALIDATION_FAILED', 'Each product may appear only once in a template.')
      }
      const found = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true } })
      if (found.length !== new Set(ids).size) {
        throw new AppError('VALIDATION_FAILED', 'One or more selected products no longer exist.')
      }
      meta.version = template.version + 1
      linesAfter = body.lines
        .map((l) => ({ productId: l.productId, rule: l.rule, value: l.value, allowance: l.allowance, sortOrder: l.sortOrder }))
        .sort(bySort)
    }

    if (Object.keys(meta).length === 0) throw new AppError('VALIDATION_FAILED', 'Nothing to update.')

    const updated = await db.systemTemplate.update({ where: { id }, data: meta })

    if (body.lines !== undefined) {
      // Replace the whole BOM: lines are unique per (template, product), so a
      // clean delete + recreate is simpler than diffing individual rows.
      await db.templateBomLine.deleteMany({ where: { templateId: id } })
      await db.templateBomLine.createMany({
        data: body.lines.map((l) => ({
          templateId: id, productId: l.productId, rule: l.rule,
          value: l.value, allowance: l.allowance, sortOrder: l.sortOrder,
        })),
      })
    }

    await audit({
      actorType: 'USER', actorId: actor.id, entityType: 'template', entityId: id,
      action: 'TEMPLATE_UPDATE',
      before,
      after: {
        name: updated.name,
        isActive: updated.isActive,
        defaultCableDistanceM: updated.defaultCableDistanceM,
        labourAllowancePaise: updated.labourAllowancePaise,
        priceOverridePaise: updated.priceOverridePaise,
        lines: linesAfter,
      },
    })

    return {
      template: await db.systemTemplate.findUnique({
        where: { id },
        include: { bomLines: { include: { product: true } }, panelProduct: true },
      }),
    }
  })
}
