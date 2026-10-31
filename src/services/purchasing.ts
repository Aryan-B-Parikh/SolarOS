import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';
import { POStatus } from '@prisma/client';

export async function listSuppliers() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
  });

  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    contact: s.contact || '',
    phone: s.phone || '',
    email: s.email || '',
    gstin: s.gstin || '',
    isActive: s.is_active,
  }));
}

export async function createSupplier(data: {
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  gstin?: string;
}) {
  if (!data.name?.trim()) {
    throw new AppError('VALIDATION_FAILED', 'Supplier name is required', 400);
  }

  const existing = await prisma.supplier.findUnique({
    where: { name: data.name.trim() },
  });
  if (existing) {
    throw new AppError('CONFLICT', 'Supplier with this name already exists', 409);
  }

  return prisma.supplier.create({
    data: {
      name: data.name.trim(),
      contact: data.contact?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      gstin: data.gstin?.trim() || null,
      is_active: true,
    },
  });
}

export async function listPurchaseOrders() {
  const pos = await prisma.purchaseOrder.findMany({
    include: {
      supplier: { select: { name: true } },
      lines: { select: { id: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  return pos.map((po) => ({
    id: po.id,
    poNumber: po.po_number,
    supplierName: po.supplier.name,
    status: po.status,
    orderedOn: po.ordered_on.toISOString().split('T')[0],
    expectedOn: po.expected_on ? po.expected_on.toISOString().split('T')[0] : null,
    totalPaise: Number(po.total_paise),
    lineCount: po.lines.length,
  }));
}

export async function getPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      lines: {
        include: {
          product: { select: { id: true, name: true, sku: true, category: true } },
        },
      },
    },
  });

  if (!po) {
    throw new AppError('NOT_FOUND', 'Purchase order not found', 404);
  }

  return {
    id: po.id,
    poNumber: po.po_number,
    supplierId: po.supplier_id,
    supplierName: po.supplier.name,
    status: po.status,
    orderedOn: po.ordered_on.toISOString().split('T')[0],
    expectedOn: po.expected_on ? po.expected_on.toISOString().split('T')[0] : null,
    totalPaise: Number(po.total_paise),
    lines: po.lines.map((l) => ({
      id: l.id,
      productId: l.product_id,
      productName: l.product.name,
      productSku: l.product.sku,
      qtyOrdered: Number(l.qty_ordered),
      qtyReceived: Number(l.qty_received),
      unitCostPaise: Number(l.unit_cost_paise),
    })),
  };
}

export async function createPurchaseOrder(
  data: {
    supplierId: string;
    orderedOn?: string;
    expectedOn?: string;
    lines: Array<{
      productId: string;
      qtyOrdered: number;
      unitCostPaise: number;
    }>;
  },
  actorId?: string
) {
  if (!data.supplierId) {
    throw new AppError('VALIDATION_FAILED', 'Supplier is required', 400);
  }
  if (!data.lines || data.lines.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'At least one line item is required', 400);
  }

  // Find a default system user if actorId is not provided
  let creatorId = actorId;
  if (!creatorId) {
    const user = await prisma.user.findFirst();
    if (user) creatorId = user.id;
  }
  if (!creatorId) {
    throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
  }

  const now = new Date();
  const year = now.getFullYear();
  const count = await prisma.purchaseOrder.count();
  const poNumber = `PO-${year}-${String(count + 1).padStart(4, '0')}`;

  let totalPaise = 0n;
  data.lines.forEach((l) => {
    totalPaise += BigInt(Math.round(l.qtyOrdered * l.unitCostPaise));
  });

  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        po_number: poNumber,
        supplier_id: data.supplierId,
        status: POStatus.OPEN,
        ordered_on: data.orderedOn ? new Date(data.orderedOn) : now,
        expected_on: data.expectedOn ? new Date(data.expectedOn) : null,
        total_paise: totalPaise,
        created_by: creatorId!,
        lines: {
          create: data.lines.map((l) => ({
            product_id: l.productId,
            qty_ordered: l.qtyOrdered,
            unit_cost_paise: BigInt(l.unitCostPaise),
          })),
        },
      },
      include: { lines: true },
    });

    await recordAudit(
      {
        actorType: 'USER',
        actorId: creatorId,
        entityType: 'PURCHASE_ORDER',
        entityId: po.id,
        action: 'PO_CREATED',
        after: { poNumber, totalPaise: Number(totalPaise) },
      },
      tx
    );

    return po;
  });
}
