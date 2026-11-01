// FR-7.7 warranty exclusion workflow: SUPPORT requests a void with photo
// evidence + reason; a DIRECTOR approves (warranty → VOID) or rejects.
// The capability matrix names the director the exclusion approval authority.

import { db } from '@/lib/db'
import { AppError } from '@/lib/errors'
import { audit, enqueue } from '@/lib/outbox'

export async function requestWarrantyVoid(warrantyId: string, input: { reason: string; attachmentIds: string[] }, actorId: string) {
  const warranty = await db.warranty.findUnique({ where: { id: warrantyId }, include: { unit: { include: { product: true } } } })
  if (!warranty) throw new AppError('NOT_FOUND', 'Warranty not found.')
  if (warranty.status === 'VOID') throw new AppError('INVALID_TRANSITION', 'This warranty is already void.')
  if (warranty.voidRequestedBy) throw new AppError('INVALID_TRANSITION', 'An exclusion request is already pending approval.')
  if (input.reason.trim().length < 10) throw new AppError('VALIDATION_FAILED', 'Describe the reason in at least 10 characters.')
  // photo evidence is mandatory (physical damage / tampering)
  const evidence = await db.attachment.findMany({ where: { id: { in: input.attachmentIds }, ownerType: 'WARRANTY', ownerId: warrantyId } })
  if (evidence.length === 0) throw new AppError('VALIDATION_FAILED', 'At least one photo of the damage is required.')

  const updated = await db.warranty.update({
    where: { id: warrantyId },
    data: { voidRequestedBy: actorId, voidRequestedAt: new Date(), voidRequestReason: input.reason.trim() },
  })
  await audit({
    actorType: 'USER', actorId, entityType: 'warranty', entityId: warrantyId,
    action: 'exclusion_request', after: { reason: input.reason.trim(), photos: evidence.length },
  })
  await enqueue({
    channel: 'EMAIL', recipient: 'director@sunpower.example', template: 'WARRANTY_EXCLUSION_REQUEST',
    payload: { warrantyId, unit: warranty.unit?.serialNumber ?? '—', reason: input.reason.trim(), photos: evidence.length },
  })
  return updated
}

export async function approveWarrantyVoid(warrantyId: string, actorId: string) {
  const warranty = await db.warranty.findUnique({ where: { id: warrantyId }, include: { customer: true } })
  if (!warranty) throw new AppError('NOT_FOUND', 'Warranty not found.')
  if (!warranty.voidRequestedBy) throw new AppError('INVALID_TRANSITION', 'No exclusion request is pending for this warranty.')
  if (warranty.status === 'VOID') throw new AppError('INVALID_TRANSITION', 'This warranty is already void.')

  await db.warranty.update({
    where: { id: warrantyId },
    data: { status: 'VOID', voidReason: warranty.voidRequestReason, voidedBy: actorId, voidRequestedBy: null, voidRequestedAt: null, voidRequestReason: null },
  })
  await audit({
    actorType: 'USER', actorId, entityType: 'warranty', entityId: warrantyId,
    action: 'exclusion_approve', after: { voidReason: warranty.voidRequestReason, requestedBy: warranty.voidRequestedBy },
  })
  await enqueue({
    channel: 'SMS', recipient: warranty.customer.phone.slice(0, 6) + 'XXXX' + warranty.customer.phone.slice(-3),
    template: 'WARRANTY_VOIDED',
    payload: { to: warranty.customer.phone, serial: warranty.unitId ?? 'equipment' },
  })
  return { ok: true }
}

export async function rejectWarrantyVoid(warrantyId: string, actorId: string, note?: string) {
  const warranty = await db.warranty.findUnique({ where: { id: warrantyId } })
  if (!warranty) throw new AppError('NOT_FOUND', 'Warranty not found.')
  if (!warranty.voidRequestedBy) throw new AppError('INVALID_TRANSITION', 'No exclusion request is pending for this warranty.')
  await db.warranty.update({
    where: { id: warrantyId },
    data: { voidRequestedBy: null, voidRequestedAt: null, voidRequestReason: null },
  })
  await audit({
    actorType: 'USER', actorId, entityType: 'warranty', entityId: warrantyId,
    action: 'exclusion_reject', after: { note: note ?? null, requestedBy: warranty.voidRequestedBy },
  })
  return { ok: true }
}

/** evidence photos staged by staff uploads (ownerType WARRANTY, ownerId warrantyId) */
export async function warrantyEvidence(warrantyId: string) {
  return db.attachment.findMany({ where: { ownerType: 'WARRANTY', ownerId: warrantyId }, orderBy: { createdAt: 'asc' } })
}
