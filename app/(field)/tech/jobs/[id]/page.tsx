import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getInstallation } from '@/services/installations';
import { formatDateIST } from '@/lib/dates';
import {
  ArrowLeft,
  CheckCircle2,
  Camera,
  Sun,
  Award,
  FileCheck2,
} from 'lucide-react';
import InstallationStepperClient from './InstallationStepperClient';

export const dynamic = 'force-dynamic';

interface GalleryPhoto {
  id: string;
  kind: string;
  mime: string;
}

function PhotoTile({ photo, fallbackLabel }: { photo: GalleryPhoto; fallbackLabel: string }) {
  if (photo.mime.startsWith('image/')) {
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
        {/* Staff session cookie authorises the private attachment endpoint (D14) */}
        <img
          src={`/api/v1/attachments/${photo.id}`}
          alt={`${fallbackLabel} (${photo.kind})`}
          className="w-full h-full object-cover"
        />
        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold">
          {photo.kind}
        </span>
      </div>
    );
  }
  return (
    <a
      href={`/api/v1/attachments/${photo.id}`}
      target="_blank"
      rel="noreferrer"
      className="aspect-video rounded-xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
    >
      <FileCheck2 className="w-5 h-5 mb-1 text-slate-400" />
      {photo.mime === 'application/pdf' ? 'PDF proof' : 'Attachment'} · {photo.kind}
    </a>
  );
}

function PhotoGallerySection({
  before,
  after,
}: {
  before: GalleryPhoto[];
  after: GalleryPhoto[];
}) {
  return (
    <div className="max-w-md mx-auto px-3 pb-28 pt-2 space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-100 pb-2">
          <Camera className="w-5 h-5 text-orange-600" />
          <span>Before / After Site Photos</span>
        </div>

        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Before · Site Survey ({before.length})
          </h4>
          {before.length === 0 ? (
            <p className="text-xs text-slate-400">No survey photos on record.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {before.map((p) => (
                <PhotoTile key={p.id} photo={p} fallbackLabel="Survey" />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            After · Installation ({after.length})
          </h4>
          {after.length === 0 ? (
            <p className="text-xs text-slate-400">
              No installation photos uploaded yet. They appear here as the crew captures them in
              the stepper.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {after.map((p) => (
                <PhotoTile key={p.id} photo={p} fallbackLabel="Installation" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function TechJobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let installation: Awaited<ReturnType<typeof getInstallation>> | null = null;
  try {
    installation = await getInstallation(params.id);
  } catch {
    installation = null;
  }

  if (!installation) {
    notFound();
  }

  const items = installation.lines.map((line) => ({
    productName: line.productName,
    productSku: line.productSku,
    qty: line.qty,
    serialNumbers: installation!.units
      .filter((u) => u.productId === line.productId)
      .map((u) => u.serialNumber),
  }));

  const before: GalleryPhoto[] = installation.photos.before.map((p) => ({
    id: p.id,
    kind: p.kind,
    mime: p.mime,
  }));
  const after: GalleryPhoto[] = installation.photos.after
    .filter((p) => p.kind !== 'SIGNATURE')
    .map((p) => ({ id: p.id, kind: p.kind, mime: p.mime }));

  // ── Completed job: handover summary + gallery (FR-6.9) ────────────────────
  if (installation.status === 'COMPLETED') {
    return (
      <>
        <div className="max-w-md mx-auto px-3 pt-2 space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
            <Link
              href="/tech/today"
              className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-xs"
              aria-label="Back to today's jobs"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </Link>
            <div>
              <span className="font-mono text-[11px] font-bold text-orange-600">
                {installation.orderNumber}
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Completed Job</h1>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>Installation Certified</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Customer</span>
                <span className="font-bold text-slate-900">{installation.customerName}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Site</span>
                <span className="font-semibold text-slate-700">{installation.address}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Capacity</span>
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  {installation.installedCapacityKw != null
                    ? `${installation.installedCapacityKw} kW`
                    : '-'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Test Reading</span>
                <span className="font-bold text-slate-900">
                  {installation.testReadingW != null
                    ? `${installation.testReadingW.toLocaleString('en-IN')} W`
                    : '-'}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Signed by</span>
                <span className="font-bold text-slate-900">{installation.signedName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Signed on</span>
                <span className="font-semibold text-slate-700">
                  {installation.signedAt ? formatDateIST(installation.signedAt) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Certificate no.</span>
                <span className="font-mono font-semibold text-slate-700">
                  {installation.certificateNumber}
                </span>
              </div>
            </div>

            {installation.signoffHash && (
              <div className="p-3 bg-slate-900 rounded-xl text-[10px] font-mono text-amber-400 break-all border border-slate-800">
                {installation.signoffHash}
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900">
              <Award className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                The commissioning certificate link has been issued to the customer (valid 90 days).
                {installation.warranties.length > 0
                  ? ` ${installation.warranties.length} active warranty record(s) cover this system.`
                  : ''}
              </span>
            </div>

            <Link
              href="/tech/today"
              className="block w-full min-h-[48px] leading-[48px] text-center bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold"
            >
              Return to Today&apos;s Jobs
            </Link>
          </div>
        </div>
        <PhotoGallerySection before={before} after={after} />
      </>
    );
  }

  // ── Active job: stepper + gallery ────────────────────────────────────────
  const stepperData = {
    id: installation.id,
    status: installation.status,
    holdReason: installation.holdReason,
    scheduledOn: installation.scheduledOn,
    orderedCapacityKw: installation.orderCapacityKw,
    installedCapacityKw: installation.installedCapacityKw,
    testReadingW: installation.testReadingW,
    checklist: installation.checklist as Record<string, boolean> | null,
    orderNumber: installation.orderNumber,
    customerName: installation.customerName,
    customerPhone: installation.customerPhone,
    customerAddress: installation.address,
    crewLeadName: installation.crewLead?.name || 'Technician',
    items,
    existingPhotos: after.map((p) => ({ id: p.id, kind: p.kind, mime: p.mime })),
  };

  return (
    <>
      <InstallationStepperClient initialInstallation={stepperData} />
      <PhotoGallerySection before={before} after={after} />
    </>
  );
}
