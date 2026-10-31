import { NextRequest, NextResponse } from 'next/server';
import { createApiHandler } from '@/lib/handler';
import { listSuppliers, createSupplier } from '@/services/purchasing';
import { z } from 'zod';

const CreateSupplierSchema = z.object({
  name: z.string().min(2, 'Supplier name required'),
  contact: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  gstin: z.string().optional(),
});

export const GET = createApiHandler(
  {
    allowedRoles: ['DIRECTOR', 'WAREHOUSE', 'SALES', 'TECHNICIAN'],
  },
  async () => {
    const suppliers = await listSuppliers();
    return NextResponse.json(suppliers);
  }
);

export const POST = createApiHandler(
  {
    bodySchema: CreateSupplierSchema,
    allowedRoles: ['DIRECTOR', 'WAREHOUSE'],
  },
  async ({ body }) => {
    const supplier = await createSupplier(body);
    return NextResponse.json(supplier, { status: 201 });
  }
);
