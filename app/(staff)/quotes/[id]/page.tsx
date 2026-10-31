import React from 'react';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { 
  FileText, ArrowLeft, Printer, Send, CheckCircle2, 
  ExternalLink, User, Calendar, ShieldCheck, AlertTriangle 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { formatDateIST } from '@/lib/dates';
import QuoteDetailClient from './QuoteDetailClient';

export const dynamic = 'force-dynamic';

export default async function QuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      lead: { include: { survey: true, assessment: true } },
      template: true,
      lines: {
        include: { product: true },
        orderBy: { sort_order: 'asc' },
      },
      order: true,
    },
  });

  if (!quote) notFound();

  return <QuoteDetailClient initialQuote={quote as any} />;
}
