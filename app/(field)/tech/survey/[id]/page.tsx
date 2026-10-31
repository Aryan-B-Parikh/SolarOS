/**
 * SunPower Ops - Mobile Survey Form
 * Phase 2 - Member 3: Operations Frontend
 * Spec: S14, FR-4.1-4.4, PRD 1.7 (field ergonomics)
 * Contract: SubmitSurveySchema from src/contracts/index.ts
 *
 * FR-2.3: Site photos are uploaded to /api/v1/uploads (entityType=SURVEY,
 * kind=SURVEY) and the submit payload carries the real attachment UUIDs.
 * Offline captures are queued (IndexedDB) and the submission is blocked
 * until every photo has synced - no placeholder ids are ever sent.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  saveDraft,
  loadDraft,
  deleteDraft,
  queueUpload,
  enqueueMutation,
  flushOfflineQueue,
  isOnline,
  onOnline,
  onOffline,
} from '@/lib/offline-queue';
import OfflineBanner from '@/components/OfflineBanner';

type RoofType = 'RCC_FLAT' | 'TIN_SHED' | 'TILED' | 'OTHER';
type ShadingLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

interface SurveyPhoto {
  localId: string;
  dataUrl: string;
  name: string;
  /** Real attachment UUID once uploaded; null while the upload is queued offline. */
  attachmentId: string | null;
}

interface SurveyFormData {
  roofType: RoofType;
  azimuthDeg: number;
  tiltDeg: number;
  usableAreaSqm: number;
  shading: ShadingLevel;
  cableDistanceM: number;
  structureHeightM: number;
  notes: string;
}

const ROOF_TYPES: { value: RoofType; label: string; icon: string }[] = [
  { value: 'RCC_FLAT', label: 'RCC Flat', icon: '🏢' },
  { value: 'TIN_SHED', label: 'Tin Shed', icon: '🏭' },
  { value: 'TILED', label: 'Tiled', icon: '🏠' },
  { value: 'OTHER', label: 'Other', icon: '🔧' },
];

const SHADING_LEVELS: { value: ShadingLevel; label: string; factor: string; color: string }[] = [
  { value: 'NONE', label: 'No Shade', factor: '100%', color: '#16a34a' },
  { value: 'LOW', label: 'Low', factor: '95%', color: '#65a30d' },
  { value: 'MEDIUM', label: 'Medium', factor: '85%', color: '#d97706' },
  { value: 'HIGH', label: 'Heavy', factor: '70%', color: '#dc2626' },
];

const COMPASS_DIRS = [
  { deg: 0, label: 'N' }, { deg: 45, label: 'NE' }, { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' }, { deg: 180, label: 'S' }, { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' }, { deg: 315, label: 'NW' },
];

const DEFAULT_FORM: SurveyFormData = {
  roofType: 'RCC_FLAT',
  azimuthDeg: 180,
  tiltDeg: 15,
  usableAreaSqm: 30,
  shading: 'NONE',
  cableDistanceM: 25,
  structureHeightM: 3,
  notes: '',
};

const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '48px',
  padding: '12px 16px',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  fontSize: '16px',
  backgroundColor: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#475569',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '16px',
  padding: '18px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export default function SurveyFormPage() {
  const params = useParams();
  const router = useRouter();
  const surveyId = (params?.id as string) || '';

  const [form, setForm] = useState<SurveyFormData>(DEFAULT_FORM);
  const [photos, setPhotos] = useState<SurveyPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [online, setOnlineState] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingPhotoCount = photos.filter((p) => !p.attachmentId).length;

  // Reconcile queued offline photos with the attachments that landed on the
  // server after a flush (uploads replay in capture order).
  const syncPhotosFromServer = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/surveys/${surveyId}`);
      if (!res.ok) return;
      const data = await res.json();
      const serverAttachments: { id: string }[] = data?.survey?.attachments ?? [];
      setPhotos((prev) => {
        if (!prev.some((p) => !p.attachmentId)) return prev;
        const known = new Set(prev.filter((p) => p.attachmentId).map((p) => p.attachmentId));
        const newIds = serverAttachments.filter((a) => !known.has(a.id)).map((a) => a.id);
        if (newIds.length === 0) return prev;
        let idx = 0;
        return prev.map((p) =>
          !p.attachmentId && idx < newIds.length ? { ...p, attachmentId: newIds[idx++] } : p
        );
      });
    } catch {
      // Offline - banner already communicates state
    }
  }, [surveyId]);

  // Connectivity listeners: on reconnect, flush queued photo uploads then
  // reconcile the real attachment ids so submission can proceed.
  useEffect(() => {
    setOnlineState(isOnline());
    const off = onOffline(() => setOnlineState(false));
    const on = onOnline(() => {
      setOnlineState(true);
      flushOfflineQueue()
        .catch(() => {})
        .then(() => syncPhotosFromServer());
    });
    return () => {
      on();
      off();
    };
  }, [syncPhotosFromServer]);

  // Load existing draft or remote data
  useEffect(() => {
    if (!surveyId) return;

    loadDraft('SURVEY', surveyId)
      .then((draft) => {
        if (draft && draft.data) {
          const d = draft.data as any;
          if (d.form) setForm({ ...DEFAULT_FORM, ...d.form });
          if (Array.isArray(d.photos)) {
            setPhotos(
              d.photos
                .filter((p: any) => p && typeof p.dataUrl === 'string')
                .map((p: any) => ({
                  localId: p.localId,
                  dataUrl: p.dataUrl,
                  name: p.name || 'photo',
                  attachmentId: typeof p.attachmentId === 'string' ? p.attachmentId : null,
                }))
            );
          }
          setDraftSaved(true);
        } else {
          // Fetch survey info from server if online
          fetch(`/api/v1/surveys/${surveyId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((res) => {
              if (res?.survey) {
                setForm((prev) => ({
                  ...prev,
                  roofType: res.survey.roof_type || prev.roofType,
                  azimuthDeg: res.survey.azimuth_deg ?? prev.azimuthDeg,
                  tiltDeg: res.survey.tilt_deg ?? prev.tiltDeg,
                  usableAreaSqm: Number(res.survey.usable_area_sqm) || prev.usableAreaSqm,
                  shading: res.survey.shading || prev.shading,
                  cableDistanceM: Number(res.survey.cable_distance_m) || prev.cableDistanceM,
                  structureHeightM: Number(res.survey.structure_height_m) || prev.structureHeightM,
                  notes: res.survey.notes || '',
                }));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    // Photos queued in a previous session may already be uploaded server-side
    if (isOnline()) {
      flushOfflineQueue()
        .catch(() => {})
        .then(() => syncPhotosFromServer());
    }
  }, [surveyId, syncPhotosFromServer]);

  // Autosave draft every 2 seconds
  const autosave = useCallback(() => {
    if (!surveyId) return;
    saveDraft('SURVEY', surveyId, { form, photos }).then(() => setDraftSaved(true));
  }, [form, photos, surveyId]);

  useEffect(() => {
    const t = setTimeout(autosave, 2000);
    return () => clearTimeout(t);
  }, [autosave]);

  function update<K extends keyof SurveyFormData>(key: K, val: SurveyFormData[K]) {
    setForm((p) => ({ ...p, [key]: val }));
    setDraftSaved(false);
  }

  // ── Photo capture & upload (FR-2.3) ─────────────────────────────────────
  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    for (const file of Array.from(files)) {
      if (!ALLOWED_PHOTO_MIME.includes(file.type)) {
        setError('Unsupported photo type. Use JPEG, PNG or WebP.');
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setError('Photo exceeds the 10 MB upload limit.');
        continue;
      }

      const localId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? `photo-${crypto.randomUUID()}`
          : `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const dataUrl = await readFileAsDataUrl(file).catch(() => '');
      const fileName = file.name || 'survey-photo.jpg';

      const queueForSync = async () => {
        await queueUpload('SURVEY', surveyId, file, fileName, { kind: 'SURVEY' });
        setPhotos((prev) => [...prev, { localId, dataUrl, name: fileName, attachmentId: null }]);
      };

      if (!isOnline()) {
        await queueForSync();
        continue;
      }

      try {
        const fd = new FormData();
        fd.append('file', file, fileName);
        fd.append('entityType', 'SURVEY');
        fd.append('entityId', surveyId);
        fd.append('kind', 'SURVEY');
        const res = await fetch('/api/v1/uploads', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw Object.assign(
            new Error(data.error?.message || data.message || 'Photo upload failed'),
            { serverError: true }
          );
        }
        setPhotos((prev) => [
          ...prev,
          { localId, dataUrl, name: fileName, attachmentId: data.id as string },
        ]);
        setError('');
      } catch (err: unknown) {
        const serverErr = err as { serverError?: boolean; message?: string };
        if (serverErr.serverError) {
          setError(serverErr.message || 'Photo upload failed');
        } else {
          // Network failure mid-upload - queue the bytes for background sync
          await queueForSync();
        }
      }
    }
  }

  function removePhoto(localId: string) {
    setPhotos((prev) => prev.filter((p) => p.localId !== localId));
    setDraftSaved(false);
  }

  async function handleSyncNow() {
    setSyncing(true);
    setError('');
    try {
      await flushOfflineQueue();
      await syncPhotosFromServer();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Sync failed. Try again when back online.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleSubmit() {
    setError('');
    setSuccessMsg('');

    // Guard 1: at least 1 real photo (SubmitSurveySchema min 1)
    if (photos.length === 0) {
      setError('At least 1 site photo is required. Capture the roof / site before submitting.');
      return;
    }

    // Guard 2: every photo must be uploaded (no placeholder ids are ever sent)
    if (pendingPhotoCount > 0) {
      setError(
        `${pendingPhotoCount} photo(s) still pending upload. Reconnect and tap "Sync Photos" - the survey can be submitted once all photos are synced.`
      );
      return;
    }

    setSubmitting(true);

    const payload = {
      ...form,
      // SubmitSurveySchema requires structureHeightM to be positive when present
      ...(form.structureHeightM > 0 ? { structureHeightM: form.structureHeightM } : {}),
      photoAttachmentIds: photos.map((p) => p.attachmentId as string),
    };

    // If offline (but all photos already uploaded), queue for background sync
    if (!isOnline()) {
      try {
        await enqueueMutation(`/api/v1/surveys/${surveyId}`, 'POST', payload);
        await deleteDraft('SURVEY', surveyId);
        setSuccessMsg('Offline: Survey saved to local sync queue. It will upload automatically once online.');
        setTimeout(() => router.push('/tech/today'), 2500);
      } catch (err: any) {
        setError('Failed to queue offline survey: ' + err.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch(`/api/v1/surveys/${surveyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error?.message || d.message || `Submit failed with status ${res.status}`);
      }

      await deleteDraft('SURVEY', surveyId);
      setSuccessMsg('Site survey submitted successfully! Redirecting...');
      setTimeout(() => router.push('/tech/today'), 1500);
    } catch (err: any) {
      // If network failed midway, fallback to queue (payload has real photo ids)
      try {
        await enqueueMutation(`/api/v1/surveys/${surveyId}`, 'POST', payload);
        await deleteDraft('SURVEY', surveyId);
        setSuccessMsg('Network issue: Survey enqueued locally. Will sync automatically.');
        setTimeout(() => router.push('/tech/today'), 2000);
      } catch {
        setError(err.message || 'Failed to submit survey');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '16px', maxWidth: '480px', margin: '0 auto', paddingBottom: '90px' }}>
      <OfflineBanner />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          style={{
            minWidth: '48px',
            minHeight: '48px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#fff',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &#8592;
        </button>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Site Survey</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            {draftSaved ? '✓ Draft saved locally' : 'Autosaving...'}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Roof Type */}
        <div style={cardStyle}>
          <label style={labelStyle}>Roof Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {ROOF_TYPES.map((rt) => (
              <button
                key={rt.value}
                type="button"
                onClick={() => update('roofType', rt.value)}
                style={{
                  minHeight: '48px',
                  borderRadius: '12px',
                  border: form.roofType === rt.value ? '2px solid #f97316' : '1px solid #e2e8f0',
                  backgroundColor: form.roofType === rt.value ? '#fff7ed' : '#fff',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <span>{rt.icon}</span> {rt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Direction (Azimuth) */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelStyle}>Roof Azimuth</label>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#f97316' }}>{form.azimuthDeg}°</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            {COMPASS_DIRS.map((d) => (
              <button
                key={d.deg}
                type="button"
                onClick={() => update('azimuthDeg', d.deg)}
                style={{
                  minWidth: '48px',
                  minHeight: '48px',
                  borderRadius: '12px',
                  border: form.azimuthDeg === d.deg ? '2px solid #f97316' : '1px solid #e2e8f0',
                  backgroundColor: form.azimuthDeg === d.deg ? '#fff7ed' : '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flex: 1,
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={359}
            value={form.azimuthDeg}
            onChange={(e) => update('azimuthDeg', Number(e.target.value))}
            style={{ width: '100%', marginTop: '12px', accentColor: '#f97316' }}
          />
        </div>

        {/* Tilt */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={labelStyle}>Roof Tilt Angle</label>
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#f97316' }}>{form.tiltDeg}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={90}
            value={form.tiltDeg}
            onChange={(e) => update('tiltDeg', Number(e.target.value))}
            style={{ width: '100%', marginTop: '10px', accentColor: '#f97316' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            <span>0° (Flat)</span>
            <span>20° (Ideal)</span>
            <span>45°</span>
            <span>90° (Vertical)</span>
          </div>
        </div>

        {/* Usable Area */}
        <div style={cardStyle}>
          <label style={labelStyle}>Usable Roof Area (m²)</label>
          <input
            type="number"
            inputMode="decimal"
            value={form.usableAreaSqm}
            onChange={(e) => update('usableAreaSqm', Math.max(1, Number(e.target.value)))}
            style={inputStyle}
            min={1}
            step={1}
          />
        </div>

        {/* Shading */}
        <div style={cardStyle}>
          <label style={labelStyle}>Shading Level</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {SHADING_LEVELS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => update('shading', s.value)}
                style={{
                  minHeight: '48px',
                  borderRadius: '12px',
                  border: form.shading === s.value ? `2px solid ${s.color}` : '1px solid #e2e8f0',
                  backgroundColor: form.shading === s.value ? `${s.color}15` : '#fff',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '2px',
                }}
              >
                <span style={{ fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{s.factor} yield</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cable Distance & Structure Height */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={cardStyle}>
            <label style={labelStyle}>Cable Dist (m)</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.cableDistanceM}
              onChange={(e) => update('cableDistanceM', Math.max(1, Number(e.target.value)))}
              style={inputStyle}
              min={1}
            />
          </div>
          <div style={cardStyle}>
            <label style={labelStyle}>Height (m)</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.structureHeightM}
              onChange={(e) => update('structureHeightM', Math.max(0, Number(e.target.value)))}
              style={inputStyle}
              min={0}
              step={0.5}
            />
          </div>
        </div>

        {/* Photos (FR-2.3 & PRD 1.7) */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={labelStyle}>Site Photos ({photos.length})</label>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Min 1 photo, uploaded before submit</span>
          </div>

          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            ref={fileInputRef}
            onChange={handlePhotoCapture}
            style={{ display: 'none' }}
            id="survey-photo-input"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: '100%',
              minHeight: '48px',
              borderRadius: '12px',
              border: '2px dashed #f97316',
              backgroundColor: '#fff7ed',
              color: '#ea580c',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: photos.length > 0 ? '12px' : '0',
            }}
          >
            📸 Take / Upload Site Photo
          </button>

          {photos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px' }}>
              {photos.map((p) => (
                <div key={p.localId} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${p.attachmentId ? '#cbd5e1' : '#fcd34d'}`, aspectRatio: '1/1' }}>
                  <img src={p.dataUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '4px',
                      backgroundColor: p.attachmentId ? 'rgba(22,163,74,0.9)' : 'rgba(245,158,11,0.95)',
                      color: '#fff',
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '6px',
                    }}
                  >
                    {p.attachmentId ? 'Uploaded' : 'Pending sync'}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePhoto(p.localId)}
                    aria-label="Remove photo"
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(0,0,0,0.65)',
                      color: '#fff',
                      border: 'none',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {pendingPhotoCount > 0 && (
            <div
              style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: '12px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span>
                {pendingPhotoCount} photo(s) pending upload - they upload automatically when you
                reconnect. Submission unlocks once all photos are synced.
              </span>
              {online && (
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={syncing}
                  style={{
                    minHeight: '44px',
                    borderRadius: '12px',
                    border: 'none',
                    backgroundColor: syncing ? '#d97706' : '#f59e0b',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: syncing ? 'default' : 'pointer',
                  }}
                >
                  {syncing ? 'Syncing…' : 'Sync Photos Now'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={cardStyle}>
          <label style={labelStyle}>Observations & Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            placeholder="Obstacles, meter box location, roof condition..."
            style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              fontSize: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <span>{error}</span>
            {pendingPhotoCount > 0 && online && (
              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing}
                style={{
                  minHeight: '44px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: syncing ? 'default' : 'pointer',
                }}
              >
                {syncing ? 'Syncing…' : 'Sync Photos'}
              </button>
            )}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', fontSize: '14px', fontWeight: 600 }}>
            {successMsg}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%',
            minHeight: '56px',
            borderRadius: '16px',
            backgroundColor: submitting ? '#94a3b8' : '#f97316',
            color: '#fff',
            border: 'none',
            fontSize: '17px',
            fontWeight: 700,
            cursor: submitting ? 'default' : 'pointer',
            boxShadow: '0 4px 12px rgba(249,115,22,0.3)',
            marginBottom: '32px',
          }}
        >
          {submitting ? 'Submitting...' : 'Submit Survey'}
        </button>
      </div>
    </div>
  );
}
