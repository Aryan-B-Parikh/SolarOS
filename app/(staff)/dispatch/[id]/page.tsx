import React from 'react';
import { notFound } from 'next/navigation';
import { getDispatch } from '@/services/dispatch';
import DispatchScanClient from './DispatchScanClient';

export const dynamic = 'force-dynamic';

export default async function DispatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const dispatch = await getDispatch(params.id);
    return <DispatchScanClient initialDispatch={dispatch as any} />;
  } catch (err: any) {
    notFound();
  }
}
