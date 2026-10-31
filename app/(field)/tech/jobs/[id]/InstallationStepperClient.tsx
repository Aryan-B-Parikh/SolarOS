'use client';

/**
 * SunPower Ops - Installation Job Stepper (FR-6.2 - FR-6.7)
 *
 * - Start / hold / resume with GPS tap-to-start (offline actions are queued)
 * - Real ARRAY / INVERTER / EARTHING photo proofs uploaded via /api/v1/uploads
 * - Offline photo capture queued via IndexedDB, reconciled with real
 *   attachment ids after flushOfflineQueue()
 * - Local draft autosave (saveDraft/loadDraft) + server draft sync
 * - Customer sign-off: signature canvas uploaded as a real attachment, full
 *   checklist, real photoAttachmentIds and an idempotency key
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Camera,
  Sun,
  ShieldCheck,
  FileCheck,
  PenTool,
  RotateCcw,
  AlertTriangle,
  Layers,
  ChevronRight,
  MapPin,
  PauseCircle,
  PlayCircle,
  RefreshCw,
} from 'lucide-react';
import { OfflineBanner } from '@/components/OfflineBanner';
import {
  saveDraft,
  loadDraft,
  deleteDraft,
  queueUpload,
  queueApiCall,
  flushOfflineQueue,
  isOnline,
  onOnline,
} from '@/lib/offline-queue';

type PhotoKind = 'ARRAY' | 'INVERTER' | 'EARTHING';

interface PhotoEntry {
  localId: string;
  kind: PhotoKind;
  /** Real server attachment UUID once uploaded (null while pending sync). */
  attachmentId: string | null;
  /** data: URL preview (survives drafts) or /api/v1/attachments/<id> for synced photos. */
  previewUrl: string;
  pendingSync: boolean;
}

interface ChecklistState {
  standsMounted: boolean;
  panelsLaid: boolean;
  wiringConnected: boolean;
  earthingDone: boolean;
  generationTested: boolean;
}

interface InstallationDetail {
  id: string;
  status: string;
  holdReason: string | null;
  scheduledOn: string;
  orderedCapacityKw: number | null;
  installedCapacityKw: number | null;
  testReadingW: number | null;
  checklist: Record<string, boolean> | null;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  crewLeadName: string;
  items: {
    productName: string;
    productSku: string;
    qty: number;
    serialNumbers: string[];
  }[];
  /** Installation photos already uploaded (kind ARRAY / INVERTER / EARTHING). */
  existingPhotos: { id: string; kind: string; mime: string }[];
}

interface DraftPayload {
  checklist: ChecklistState;
  capacityKw: string;
  testReadingW: string;
  customerName: string;
  photos: PhotoEntry[];
}

const PHOTO_KINDS: { kind: PhotoKind; label: string; hint: string }[] = [
  { kind: 'ARRAY', label: 'Solar Array', hint: 'Full panel layout on the roof' },
  { kind: 'INVERTER', label: 'Inverter & Wiring', hint: 'Inverter installed, DC/AC terminations' },
  { kind: 'EARTHING', label: 'Earthing / LA', hint: 'Earth pit & lightning arrestor connections' },
];

const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Best-effort GPS position for tap-to-start (FR-6.2). Resolves null when unavailable. */
function getGpsPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export default function InstallationStepperClient({
  initialInstallation,
}: {
  initialInstallation: InstallationDetail;
}) {
  const router = useRouter();
  const installationId = initialInstallation.id;

  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successSignoff, setSuccessSignoff] = useState<{
    hash?: string;
    certificateUrl?: string;
  } | null>(null);

  // ── Job control state (FR-6.2) ───────────────────────────────────────────
  const [status, setStatus] = useState<string>(initialInstallation.status);
  const [holdReason, setHoldReason] = useState<string | null>(initialInstallation.holdReason);
  const [showHoldForm, setShowHoldForm] = useState<boolean>(false);
  const [holdReasonInput, setHoldReasonInput] = useState<string>('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  /** Which control action is sitting in the offline queue awaiting sync. */
  const [queuedAction, setQueuedAction] = useState<'start' | 'hold' | 'resume' | null>(null);

  // ── Step 1: checklist ────────────────────────────────────────────────────
  const [checklist, setChecklist] = useState<ChecklistState>(() => ({
    standsMounted: Boolean(initialInstallation.checklist?.standsMounted),
    panelsLaid: Boolean(initialInstallation.checklist?.panelsLaid),
    wiringConnected: Boolean(initialInstallation.checklist?.wiringConnected),
    earthingDone: Boolean(initialInstallation.checklist?.earthingDone),
    generationTested: Boolean(initialInstallation.checklist?.generationTested),
  }));

  // ── Step 3: commissioning test ───────────────────────────────────────────
  const [capacityKw, setCapacityKw] = useState<string>(
    initialInstallation.installedCapacityKw != null ? String(initialInstallation.installedCapacityKw) : ''
  );
  const [testReadingW, setTestReadingW] = useState<string>(
    initialInstallation.testReadingW != null ? String(initialInstallation.testReadingW) : ''
  );

  // ── Step 4: photo proofs (FR-6.5) ────────────────────────────────────────
  const [photos, setPhotos] = useState<PhotoEntry[]>(() =>
    initialInstallation.existingPhotos
      .filter((p) => p.kind === 'ARRAY' || p.kind === 'INVERTER' || p.kind === 'EARTHING')
      .map((p) => ({
        localId: `server-${p.id}`,
        kind: p.kind as PhotoKind,
        attachmentId: p.id,
        previewUrl: `/api/v1/attachments/${p.id}`,
        pendingSync: false,
      }))
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureKindRef = useRef<PhotoKind>('ARRAY');

  // ── Step 5: signature ────────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState<string>(initialInstallation.customerName || '');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasSignature, setHasSignature] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // ── Offline drafts (FR-6.7) ──────────────────────────────────────────────
  const [draftState, setDraftState] = useState<'LOADING' | 'PROMPT' | 'ACTIVE'>('LOADING');
  const [draftPrompt, setDraftPrompt] = useState<{ savedAt: number; data: DraftPayload } | null>(null);

  const pendingPhotoCount = photos.filter((p) => !p.attachmentId).length;
  const syncedPhotosByKind = (kind: PhotoKind) => photos.filter((p) => p.kind === kind && p.attachmentId);

  // ── Server sync / reconciliation ─────────────────────────────────────────
  const syncFromServer = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/installations/${installationId}`);
      if (!res.ok) return;
      const data = await res.json();

      setStatus((prev) => (prev === 'COMPLETED' ? prev : data.status ?? prev));
      setHoldReason(data.holdReason ?? null);

      // A queued control action that has landed server-side is no longer queued
      setQueuedAction((prev) => {
        if (!prev) return prev;
        if (prev === 'start' && data.status === 'IN_PROGRESS') return null;
        if (prev === 'hold' && data.status === 'ON_HOLD') return null;
        if (prev === 'resume' && data.status === 'IN_PROGRESS') return null;
        return prev;
      });

      // Reconcile pending offline photos with attachments that appeared on the
      // server (flushOfflineQueue uploads them in capture order).
      const serverAfter: { id: string }[] = data.photos?.after ?? [];
      setPhotos((prev) => {
        if (!prev.some((p) => !p.attachmentId)) return prev;
        const known = new Set(prev.filter((p) => p.attachmentId).map((p) => p.attachmentId));
        const newIds = serverAfter.filter((p) => !known.has(p.id)).map((p) => p.id);
        if (newIds.length === 0) return prev;
        let idx = 0;
        return prev.map((p) => {
          if (!p.attachmentId && idx < newIds.length) {
            const aid = newIds[idx++];
            return { ...p, attachmentId: aid, previewUrl: `/api/v1/attachments/${aid}`, pendingSync: false };
          }
          return p;
        });
      });
    } catch {
      // Offline / network hiccup - the offline banner already communicates state
    }
  }, [installationId]);

  // On mount: flush any queue left from a previous session, reconcile photos
  // with the server, and look for a local draft to offer restoring.
  useEffect(() => {
    let cancelled = false;
    if (isOnline()) {
      flushOfflineQueue()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) syncFromServer();
        });
    }
    loadDraft('INSTALLATION', installationId)
      .then((draft) => {
        if (cancelled) return;
        if (draft && draft.data && (draft.data as DraftPayload).checklist) {
          setDraftPrompt({ savedAt: draft.savedAt, data: draft.data as DraftPayload });
          setDraftState('PROMPT');
        } else {
          setDraftState('ACTIVE');
        }
      })
      .catch(() => {
        if (!cancelled) setDraftState('ACTIVE');
      });
    const off = onOnline(() => {
      flushOfflineQueue()
        .catch(() => {})
        .finally(() => syncFromServer());
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [installationId, syncFromServer]);

  // Local draft autosave (IndexedDB) - never lose field input (PRD 3.1)
  useEffect(() => {
    if (draftState !== 'ACTIVE') return;
    const t = setTimeout(() => {
      const payload: DraftPayload = { checklist, capacityKw, testReadingW, customerName, photos };
      saveDraft('INSTALLATION', installationId, payload as unknown as Record<string, unknown>).catch(
        () => {}
      );
    }, 700);
    return () => clearTimeout(t);
  }, [checklist, capacityKw, testReadingW, customerName, photos, draftState, installationId]);

  // Server-side draft sync (cross-device continuity) - best effort, online only
  useEffect(() => {
    if (draftState !== 'ACTIVE' || status === 'COMPLETED') return;
    const t = setTimeout(() => {
      if (!isOnline()) return;
      const kw = parseFloat(capacityKw);
      const tw = parseFloat(testReadingW);
      fetch(`/api/v1/installations/${installationId}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist,
          ...(Number.isFinite(kw) && kw > 0 ? { installedCapacityKw: kw } : {}),
          ...(Number.isFinite(tw) && tw >= 0 ? { testReadingW: tw } : {}),
        }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [checklist, capacityKw, testReadingW, draftState, status, installationId]);

  function restoreDraft() {
    const d = draftPrompt?.data;
    if (!d) return;
    setChecklist((prev) => ({ ...prev, ...(d.checklist || {}) }));
    if (typeof d.capacityKw === 'string') setCapacityKw(d.capacityKw);
    if (typeof d.testReadingW === 'string') setTestReadingW(d.testReadingW);
    if (typeof d.customerName === 'string') setCustomerName(d.customerName);
    if (Array.isArray(d.photos)) {
      setPhotos(
        d.photos
          .filter((p) => p && (p.kind === 'ARRAY' || p.kind === 'INVERTER' || p.kind === 'EARTHING'))
          .map((p) => ({
            localId: p.localId,
            kind: p.kind,
            attachmentId: p.attachmentId || null,
            previewUrl: p.attachmentId ? `/api/v1/attachments/${p.attachmentId}` : p.previewUrl || '',
            pendingSync: !p.attachmentId,
          }))
      );
    }
    setDraftPrompt(null);
    setDraftState('ACTIVE');
    // Pending photos may already have been uploaded by a previous flush
    if (isOnline()) syncFromServer();
  }

  function discardDraft() {
    deleteDraft('INSTALLATION', installationId).catch(() => {});
    setDraftPrompt(null);
    setDraftState('ACTIVE');
  }

  // ── Signature canvas ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
  }, [step]);

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    setIsDrawing(true);
    draw(e);
  }

  function stopDrawing() {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.beginPath();
    }
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    setHasSignature(true);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  // ── Photo capture & upload (FR-6.5) ──────────────────────────────────────
  function triggerCapture(kind: PhotoKind) {
    captureKindRef.current = kind;
    fileInputRef.current?.click();
  }

  async function handleCapturePhoto(kind: PhotoKind, e: React.ChangeEvent<HTMLInputElement>) {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    if (!ALLOWED_PHOTO_MIME.includes(file.type)) {
      setErrorMessage('Unsupported photo type. Use JPEG, PNG or WebP.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setErrorMessage('Photo exceeds the 10 MB upload limit.');
      return;
    }

    const localId = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = await readFileAsDataUrl(file).catch(() => '');
    const fileName = file.name || `${kind.toLowerCase()}.jpg`;

    const queueForSync = async () => {
      await queueUpload('INSTALLATION', installationId, file, fileName, { kind });
      setPhotos((prev) => [
        ...prev,
        { localId, kind, attachmentId: null, previewUrl, pendingSync: true },
      ]);
    };

    if (!isOnline()) {
      await queueForSync();
      return;
    }

    try {
      const form = new FormData();
      form.append('file', file, fileName);
      form.append('entityType', 'INSTALLATION');
      form.append('entityId', installationId);
      form.append('kind', kind);
      const res = await fetch('/api/v1/uploads', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(
          new Error(data.error?.message || data.message || 'Photo upload failed'),
          { serverError: true }
        );
      }
      setPhotos((prev) => [
        ...prev,
        { localId, kind, attachmentId: data.id, previewUrl, pendingSync: false },
      ]);
    } catch (err: unknown) {
      const serverErr = err as { serverError?: boolean; message?: string };
      if (serverErr.serverError) {
        setErrorMessage(serverErr.message || 'Photo upload failed');
      } else {
        // Network failure mid-upload - queue the bytes for background sync
        await queueForSync();
      }
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setErrorMessage(null);
    try {
      await flushOfflineQueue();
      await syncFromServer();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMessage(e.message || 'Sync failed. Try again when back online.');
    } finally {
      setSyncing(false);
    }
  }

  // ── Start / hold / resume (FR-6.2) ───────────────────────────────────────
  async function postInstallationAction(
    action: 'start' | 'hold' | 'resume',
    body: Record<string, unknown>
  ): Promise<{ queued: boolean }> {
    const url = `/api/v1/installations/${installationId}/${action}`;
    const headers = { 'Content-Type': 'application/json' };

    if (!isOnline()) {
      await queueApiCall(url, 'POST', body, headers, uuidv4());
      return { queued: true };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(
          new Error(data.error?.message || data.message || `${action} failed`),
          { serverError: true }
        );
      }
      return { queued: false };
    } catch (err: unknown) {
      const serverErr = err as { serverError?: boolean; message?: string };
      if (serverErr.serverError) throw new Error(serverErr.message || `${action} failed`);
      // Network failure - queue for background replay
      await queueApiCall(url, 'POST', body, headers, uuidv4());
      return { queued: true };
    }
  }

  async function handleStartJob() {
    setErrorMessage(null);
    setBusyAction('start');
    try {
      const coords = await getGpsPosition();
      const body: Record<string, unknown> = coords
        ? { lat: coords.lat, lng: coords.lng }
        : {};
      const { queued } = await postInstallationAction('start', body);
      if (queued) {
        setQueuedAction('start');
        setStatus('IN_PROGRESS'); // optimistic; server catches up on sync
      } else {
        setQueuedAction(null);
        setStatus('IN_PROGRESS');
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMessage(e.message || 'Could not start the job');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleHoldJob() {
    setErrorMessage(null);
    const reason = holdReasonInput.trim();
    if (reason.length < 3) {
      setErrorMessage('A hold reason of at least 3 characters is required.');
      return;
    }
    setBusyAction('hold');
    try {
      const { queued } = await postInstallationAction('hold', { holdReason: reason });
      if (queued) {
        setQueuedAction('hold');
      }
      setStatus('ON_HOLD');
      setHoldReason(reason);
      setShowHoldForm(false);
      setHoldReasonInput('');
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMessage(e.message || 'Could not place the job on hold');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResumeJob() {
    setErrorMessage(null);
    setBusyAction('resume');
    try {
      const { queued } = await postInstallationAction('resume', {});
      if (queued) {
        setQueuedAction('resume');
      }
      setStatus('IN_PROGRESS');
      setHoldReason(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMessage(e.message || 'Could not resume the job');
    } finally {
      setBusyAction(null);
    }
  }

  // ── Sign-off (FR-6.6) ────────────────────────────────────────────────────
  async function handleSubmitSignOff() {
    setErrorMessage(null);

    if (!hasSignature) {
      setErrorMessage('Please obtain the customer signature on the screen.');
      return;
    }
    if (customerName.trim().length < 2) {
      setErrorMessage('Please enter the homeowner name (min 2 characters).');
      return;
    }
    const allChecked =
      checklist.standsMounted &&
      checklist.panelsLaid &&
      checklist.wiringConnected &&
      checklist.earthingDone &&
      checklist.generationTested;
    if (!allChecked) {
      setErrorMessage('All 5 safety checklist items must be confirmed before sign-off.');
      setStep(1);
      return;
    }
    const kw = parseFloat(capacityKw);
    if (!Number.isFinite(kw) || kw <= 0) {
      setErrorMessage('Enter the installed capacity in kW (positive number).');
      setStep(3);
      return;
    }
    const tw = parseFloat(testReadingW);
    if (!Number.isFinite(tw) || tw <= 0) {
      setErrorMessage('Enter the live generation test reading in watts (positive number).');
      setStep(3);
      return;
    }
    if (pendingPhotoCount > 0) {
      setErrorMessage(
        `${pendingPhotoCount} photo(s) pending sync. Reconnect and tap "Sync Photos" - sign-off requires the uploaded attachments.`
      );
      setStep(4);
      return;
    }
    if (
      syncedPhotosByKind('ARRAY').length === 0 ||
      syncedPhotosByKind('INVERTER').length === 0 ||
      syncedPhotosByKind('EARTHING').length === 0
    ) {
      setErrorMessage(
        'At least one uploaded photo of each type is required: solar array, inverter wiring, and earthing.'
      );
      setStep(4);
      return;
    }
    if (!isOnline()) {
      setErrorMessage(
        'Sign-off needs a connection to upload the signature and certify the job. Please reconnect and retry.'
      );
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload the signature canvas as a real attachment (kind=SIGNATURE)
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Signature canvas unavailable');
      const signatureDataUrl = canvas.toDataURL('image/png');
      const signatureBlob = await (await fetch(signatureDataUrl)).blob();

      const sigForm = new FormData();
      sigForm.append('file', signatureBlob, 'signature.png');
      sigForm.append('entityType', 'INSTALLATION');
      sigForm.append('entityId', installationId);
      sigForm.append('kind', 'SIGNATURE');
      const sigRes = await fetch('/api/v1/uploads', { method: 'POST', body: sigForm });
      const sigData = await sigRes.json().catch(() => ({}));
      if (!sigRes.ok) {
        throw new Error(sigData.error?.message || sigData.message || 'Signature upload failed');
      }

      // 2. Submit the sign-off with the full, valid payload
      const payload = {
        checklist: {
          standsMounted: true,
          panelsLaid: true,
          wiringConnected: true,
          earthingDone: true,
          generationTested: true,
        },
        installedCapacityKw: kw,
        testReadingW: tw,
        signedName: customerName.trim(),
        signatureAttachmentId: sigData.id as string,
        photoAttachmentIds: photos
          .filter((p) => p.attachmentId)
          .map((p) => p.attachmentId as string),
        idempotencyKey: uuidv4(),
      };

      const res = await fetch(`/api/v1/installations/${installationId}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Installation sign-off failed');
      }

      setSuccessSignoff({
        hash: data.signoffHash,
        certificateUrl: data.certificateUrl,
      });
      setStatus('COMPLETED');
      deleteDraft('INSTALLATION', installationId).catch(() => {});
    } catch (err: unknown) {
      const e = err as { message?: string };
      setErrorMessage(e.message || 'Sign-off submission error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (successSignoff || status === 'COMPLETED') {
    return (
      <div className="max-w-md mx-auto py-10 px-4 text-center space-y-4">
        <OfflineBanner />
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Installation Certified!</h1>
          <p className="text-xs text-slate-600">
            Cryptographic SHA-256 sign-off proof generated and stored. Customer installation warranty is officially active.
          </p>
          {successSignoff?.hash && (
            <div className="p-3 bg-slate-50 rounded-xl text-[11px] font-mono text-slate-600 break-all border border-slate-200">
              Proof: {successSignoff.hash}
            </div>
          )}
          {successSignoff?.certificateUrl && (
            <a
              href={successSignoff.certificateUrl}
              className="block w-full min-h-[48px] leading-[48px] bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-xs transition-colors"
            >
              View Commissioning Certificate
            </a>
          )}
          <button
            onClick={() => router.push('/tech/today')}
            className="w-full min-h-[48px] bg-slate-900 text-white rounded-xl text-sm font-bold shadow-xs hover:bg-slate-800"
          >
            Return to Today&apos;s Jobs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4 pb-28 pt-2 px-3">
      <OfflineBanner />

      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
        <button
          onClick={() => router.push('/tech/today')}
          className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors shadow-xs"
          aria-label="Back to today's jobs"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <span className="font-mono text-[11px] font-bold text-orange-600">
            {initialInstallation.orderNumber}
          </span>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <span>Installation Stepper</span>
          </h1>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="flex-1">{errorMessage}</span>
          {pendingPhotoCount > 0 && isOnline() && (
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="shrink-0 px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync Photos'}
            </button>
          )}
        </div>
      )}

      {/* Draft restore prompt (FR-6.7) */}
      {draftState === 'PROMPT' && draftPrompt && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs space-y-2">
          <div className="flex items-start gap-2">
            <FileCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Unsaved draft found from{' '}
              {new Date(draftPrompt.savedAt).toLocaleString('en-IN')}. Restore your checklist,
              readings and photos?
            </span>
          </div>
          <div className="flex gap-2 pl-6">
            <button
              onClick={restoreDraft}
              className="flex-1 min-h-[40px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
            >
              Restore Draft
            </button>
            <button
              onClick={discardDraft}
              className="flex-1 min-h-[40px] border border-blue-300 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Job status card (FR-6.2) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <MapPin className="w-4 h-4 text-orange-600" />
            <span>Job Status</span>
          </div>
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
              status === 'IN_PROGRESS'
                ? 'bg-blue-100 text-blue-800'
                : status === 'ON_HOLD'
                ? 'bg-rose-100 text-rose-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {status.replace('_', ' ')}
          </span>
        </div>

        {holdReason && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800">
            <span className="font-bold">On hold:</span> {holdReason}
          </div>
        )}

        {status === 'SCHEDULED' && (
          <>
            <p className="text-[11px] text-slate-500">
              Tap start when on site. Your GPS coordinates are stamped on the job for verification.
            </p>
            <button
              onClick={handleStartJob}
              disabled={busyAction === 'start' || queuedAction === 'start'}
              className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-xs flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
            >
              <PlayCircle className="w-5 h-5" />
              <span>{busyAction === 'start' ? 'Starting…' : 'Start Job (GPS)'}</span>
            </button>
          </>
        )}

        {status === 'IN_PROGRESS' && !showHoldForm && (
          <button
            onClick={() => setShowHoldForm(true)}
            disabled={busyAction === 'hold' || queuedAction === 'hold'}
            className="w-full min-h-[48px] border-2 border-rose-300 text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
          >
            <PauseCircle className="w-5 h-5" />
            <span>Hold Job (reason required)</span>
          </button>
        )}

        {status === 'IN_PROGRESS' && showHoldForm && (
          <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <label className="block text-xs font-semibold text-slate-700">
              Hold reason (min 3 characters) *
            </label>
            <textarea
              value={holdReasonInput}
              onChange={(e) => setHoldReasonInput(e.target.value)}
              rows={2}
              placeholder="e.g. Roof access blocked, missing mounting clamps…"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowHoldForm(false)}
                className="flex-1 min-h-[44px] border border-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleHoldJob}
                disabled={busyAction === 'hold'}
                className="flex-1 min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold disabled:opacity-40"
              >
                {busyAction === 'hold' ? 'Holding…' : 'Confirm Hold'}
              </button>
            </div>
          </div>
        )}

        {status === 'ON_HOLD' && (
          <button
            onClick={handleResumeJob}
            disabled={busyAction === 'resume' || queuedAction === 'resume'}
            className="w-full min-h-[48px] bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-xs flex items-center justify-center gap-2 disabled:opacity-40 transition-colors"
          >
            <PlayCircle className="w-5 h-5" />
            <span>{busyAction === 'resume' ? 'Resuming…' : 'Resume Job'}</span>
          </button>
        )}

        {queuedAction && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span>
              {queuedAction === 'start' && 'Start'}
              {queuedAction === 'hold' && 'Hold'}
              {queuedAction === 'resume' && 'Resume'} action queued - it will sync to the server
              automatically when you are back online.
            </span>
          </div>
        )}
      </div>

      {/* Step Indicators */}
      <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-bold">
        {[
          { id: 1, label: 'Safety' },
          { id: 2, label: 'Serials' },
          { id: 3, label: 'Testing' },
          { id: 4, label: 'Photos' },
          { id: 5, label: 'Sign-Off' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`py-2 rounded-lg border transition-all ${
              step === s.id
                ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                : step > s.id
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white text-slate-400 border-slate-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Step 1: Pre-Work Checklist */}
      {step === 1 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <ShieldCheck className="w-5 h-5 text-orange-600" />
            <span>Step 1: Installation & Safety Checklist</span>
          </div>
          <p className="text-xs text-slate-500">
            Confirm all mechanical and electrical stages before commissioning the system. All five
            items are mandatory for sign-off.
          </p>

          <div className="space-y-3 pt-2">
            {[
              { key: 'standsMounted', label: 'Mounting Structure Anchored & Aligned' },
              { key: 'panelsLaid', label: 'Solar Panels Clamped at Specified Tilt & Azimuth' },
              { key: 'wiringConnected', label: 'DC Cabling, MC4 Connectors & Inverter Box Wired' },
              { key: 'earthingDone', label: 'Lightning Arrestor & Dual Earth Pit Connected' },
              { key: 'generationTested', label: 'AC Isolator & Generation Safety Checks Passed' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checklist[item.key as keyof ChecklistState]}
                  onChange={(e) =>
                    setChecklist({ ...checklist, [item.key]: e.target.checked })
                  }
                  className="w-5 h-5 mt-0.5 rounded text-orange-600 focus:ring-orange-500"
                />
                <span className="text-xs font-semibold text-slate-800 leading-tight">
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full min-h-[48px] bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold shadow-xs flex items-center justify-center gap-2"
          >
            <span>Next: Verify Serial Numbers</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 2: Serial Verification */}
      {step === 2 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Layers className="w-5 h-5 text-orange-600" />
            <span>Step 2: Component Verification</span>
          </div>
          <p className="text-xs text-slate-500">
            Ensure serial numbers match dispatched BOM items before powering on.
          </p>

          <div className="space-y-3">
            {initialInstallation.items.map((item, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{item.productName}</h4>
                    <span className="text-[10px] text-slate-500 font-mono">SKU: {item.productSku}</span>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    {item.qty} Unit(s)
                  </span>
                </div>
                {item.serialNumbers.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {item.serialNumbers.map((s) => (
                      <span key={s} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-700">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {initialInstallation.items.length === 0 && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                No BOM lines recorded for this order.
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 border border-slate-300 rounded-xl text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-2 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
            >
              <span>Next: Testing</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Commissioning Test */}
      {step === 3 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Sun className="w-5 h-5 text-amber-500" />
            <span>Step 3: Inverter Power & Voltage Test</span>
          </div>
          <p className="text-xs text-slate-500">
            Switch on the DC isolator and AC breaker. Record initial active output. Values are
            autosaved to your offline draft.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Installed Capacity (kW) *
              </label>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={capacityKw}
                onChange={(e) => setCapacityKw(e.target.value)}
                placeholder={
                  initialInstallation.orderedCapacityKw != null
                    ? `Ordered: ${initialInstallation.orderedCapacityKw} kW`
                    : 'e.g. 3.24'
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Active Live Generation Test (Watts) *
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={testReadingW}
                onChange={(e) => setTestReadingW(e.target.value)}
                placeholder="e.g. 2850"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-emerald-600 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Reading taken on the inverter digital display under sunlight.
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 border border-slate-300 rounded-xl text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(4)}
              className="flex-2 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
            >
              <span>Next: Photo Proofs</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Photo Proofs (FR-6.5) */}
      {step === 4 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Camera className="w-5 h-5 text-orange-600" />
            <span>Step 4: Installation Photo Proofs</span>
          </div>
          <p className="text-xs text-slate-500">
            Capture one photo of each type. Photos upload instantly when online; offline captures
            are stored safely and upload when you reconnect.
          </p>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            ref={fileInputRef}
            onChange={(e) => handleCapturePhoto(captureKindRef.current, e)}
            style={{ display: 'none' }}
            aria-label="Capture installation photo"
          />

          {PHOTO_KINDS.map(({ kind, label, hint }) => {
            const kindPhotos = photos.filter((p) => p.kind === kind);
            const syncedCount = kindPhotos.filter((p) => p.attachmentId).length;
            return (
              <div key={kind} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      {label}
                      {syncedCount > 0 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <span className="text-[10px] font-bold text-amber-600">required</span>
                      )}
                    </h4>
                    <span className="text-[10px] text-slate-500">{hint}</span>
                  </div>
                  <button
                    onClick={() => triggerCapture(kind)}
                    className="shrink-0 min-h-[44px] px-3 border-2 border-dashed border-orange-300 bg-orange-50/60 hover:bg-orange-50 text-orange-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>
                {kindPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {kindPhotos.map((p) => (
                      <div
                        key={p.localId}
                        className={`relative aspect-square rounded-xl overflow-hidden border ${
                          p.attachmentId ? 'border-slate-200 bg-slate-100' : 'border-amber-300 bg-amber-50'
                        }`}
                      >
                        {p.previewUrl ? (
                          <img src={p.previewUrl} alt={`${kind} proof`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-amber-600">
                            <Camera className="w-6 h-6" />
                          </div>
                        )}
                        <span
                          className={`absolute bottom-1 left-1 right-1 text-[8px] font-bold px-1 py-0.5 rounded text-center ${
                            p.attachmentId ? 'bg-black/60 text-white' : 'bg-amber-500 text-white'
                          }`}
                        >
                          {p.attachmentId ? 'Uploaded' : 'Pending sync'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {pendingPhotoCount > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="flex-1">
                  {pendingPhotoCount} photo(s) pending sync. They will upload automatically when
                  you reconnect - sign-off unlocks once uploads complete.
                </span>
              </div>
              {isOnline() && (
                <button
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="w-full min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? 'Syncing…' : 'Sync Photos Now'}</span>
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3 border border-slate-300 rounded-xl text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={() => setStep(5)}
              className="flex-2 py-3 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"
            >
              <span>Next: Customer Sign-Off</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Signature & Sign-Off (FR-6.6) */}
      {step === 5 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <PenTool className="w-5 h-5 text-orange-600" />
            <span>Step 5: Homeowner Digital Sign-Off</span>
          </div>
          <p className="text-xs text-slate-500">
            Customer confirms system handover, satisfactory generation test, and warranty
            commencement. The signature is uploaded and sealed into the certificate.
          </p>

          {/* Sign-off summary */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Checklist confirmed</span>
              <span className="font-bold text-slate-900">
                {Object.values(checklist).filter(Boolean).length} / 5
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Installed capacity</span>
              <span className="font-bold text-slate-900">
                {capacityKw ? `${capacityKw} kW` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Generation test</span>
              <span className="font-bold text-slate-900">
                {testReadingW ? `${testReadingW} W` : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Uploaded photos (array / inverter / earthing)</span>
              <span className="font-bold text-slate-900">
                {syncedPhotosByKind('ARRAY').length} / {syncedPhotosByKind('INVERTER').length} /{' '}
                {syncedPhotosByKind('EARTHING').length}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Homeowner / Signer Name *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Sign on Screen (Finger or Stylus) *
              </label>
              <button
                type="button"
                onClick={clearCanvas}
                className="text-xs text-rose-600 hover:text-rose-800 font-medium flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>

            <div className="border-2 border-slate-300 rounded-2xl overflow-hidden bg-slate-50 touch-none">
              <canvas
                ref={canvasRef}
                width={360}
                height={160}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onMouseMove={draw}
                onTouchStart={startDrawing}
                onTouchEnd={stopDrawing}
                onTouchMove={draw}
                className="w-full h-40 bg-white cursor-crosshair"
              />
            </div>
            {!hasSignature && (
              <span className="text-[10px] text-amber-600 mt-1 block">
                Please sign in the box above before submitting.
              </span>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setStep(4)}
              className="flex-1 py-3 border border-slate-300 rounded-xl text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={handleSubmitSignOff}
              disabled={submitting || !hasSignature || customerName.trim().length < 2}
              className="flex-2 min-h-[48px] bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
            >
              {submitting ? (
                <span>Certifying…</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submit & Certify Job</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
