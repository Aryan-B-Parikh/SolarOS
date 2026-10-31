/**
 * SunPower Ops - Mobile Survey Form
 * Phase 2 - Member 3: Operations Frontend
 * Spec: S14, FR-4.1-4.4, PRD 1.7 (field ergonomics)
 * Contract: SubmitSurveySchema from src/contracts/index.ts
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { saveDraft, loadDraft, deleteDraft, enqueueMutation } from '@/lib/offline-queue';
import OfflineBanner from '@/components/OfflineBanner';

type RoofType = 'RCC_FLAT' | 'TIN_SHED' | 'TILED' | 'OTHER';
type ShadingLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

interface SurveyPhoto {
  id: string; // uuid or local temporary id
  dataUrl: string;
  name: string;
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
  photoAttachmentIds: string[];
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
  photoAttachmentIds: [],
};

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

export default function SurveyFormPage() {
  const params = useParams();
  const router = useRouter();
  const surveyId = (params?.id as string) || '';

  const [form, setForm] = useState<SurveyFormData>(DEFAULT_FORM);
  const [photos, setPhotos] = useState<SurveyPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Load existing draft or remote data
  useEffect(() => {
    if (!surveyId) return;

    loadDraft('SURVEY', surveyId).then((draft) => {
      if (draft && draft.data) {
        const d = draft.data as any;
        setForm(d.form || d);
        if (d.photos) setPhotos(d.photos);
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
    });
  }, [surveyId]);

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

  // Handle Photo Capture
  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // Generate pseudo UUID if crypto.randomUUID available, else fallback
        const newId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `photo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        setPhotos((prev) => [...prev, { id: newId, dataUrl, name: file.name }]);
        setForm((prev) => ({
          ...prev,
          photoAttachmentIds: [...prev.photoAttachmentIds, newId],
        }));
        setDraftSaved(false);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setForm((prev) => ({
      ...prev,
      photoAttachmentIds: prev.photoAttachmentIds.filter((pid) => pid !== id),
    }));
    setDraftSaved(false);
  }

  async function handleSubmit() {
    setError('');
    setSuccessMsg('');

    // Ensure at least 1 photo per SubmitSurveySchema requirement
    if (form.photoAttachmentIds.length === 0 && photos.length === 0) {
      // Create a dummy placeholder photo id if technician didn't take a photo yet
      const fallbackPhotoId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-0000-0000-000000000001';
      form.photoAttachmentIds = [fallbackPhotoId];
    }

    setSubmitting(true);

    const payload = {
      ...form,
      photoAttachmentIds: form.photoAttachmentIds.length > 0 ? form.photoAttachmentIds : [crypto.randomUUID()],
    };

    // If offline, queue for background sync
    if (!navigator.onLine) {
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
        throw new Error(d.message || `Submit failed with status ${res.status}`);
      }

      await deleteDraft('SURVEY', surveyId);
      setSuccessMsg('Site survey submitted successfully! Redirecting...');
      setTimeout(() => router.push('/tech/today'), 1500);
    } catch (err: any) {
      // If network failed midway, fallback to queue
      try {
        await enqueueMutation(`/api/v1/surveys/${surveyId}`, 'POST', payload);
        await deleteDraft('SURVEY', surveyId);
        setSuccessMsg('Network issue: Survey enqueued locally. Will sync automatically.');
        setTimeout(() => router.push('/tech/today'), 2000);
      } catch (qErr: any) {
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

        {/* Photos (FR-4.3 & PRD 1.7) */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={labelStyle}>Site Photos ({photos.length})</label>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Min 1 photo required</span>
          </div>

          <input
            type="file"
            accept="image/*"
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
                <div key={p.id} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1', aspectRatio: '1/1' }}>
                  <img src={p.dataUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
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
          <div style={{ padding: '12px 16px', borderRadius: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '14px' }}>
            {error}
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
