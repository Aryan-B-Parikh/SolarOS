/**
 * SunPower Ops - Supplier Management
 * Phase 3 - Member 3: Operations Frontend
 * Spec: FR-5.8, Backend Schema (suppliers table)
 */
'use client';

import { useState, useEffect } from 'react';

interface Supplier {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  gstin: string;
  isActive: boolean;
}

const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: '44px', padding: '10px 14px',
  borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px',
  backgroundColor: '#fff', outline: 'none',
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contact: '', phone: '', email: '', gstin: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSuppliers(); }, []);

  async function fetchSuppliers() {
    try {
      const res = await fetch('/api/v1/suppliers');
      if (res.ok) setSuppliers(await res.json());
    } catch { /* offline */ }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/suppliers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ name: '', contact: '', phone: '', email: '', gstin: '' });
        fetchSuppliers();
      }
    } catch { /* offline */ }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Suppliers</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>{suppliers.length} suppliers</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          style={{ minHeight: '44px', padding: '10px 20px', borderRadius: '12px', backgroundColor: '#f97316', color: '#fff', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : '+ Add Supplier'}
        </button>
      </div>

      {showForm && (
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>New Supplier</h2>
          <input placeholder="Company name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <input placeholder="Contact person" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
          </div>
          <input placeholder="GSTIN" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} style={inputStyle} />
          <button onClick={handleCreate} disabled={saving || !form.name.trim()}
            style={{ minHeight: '44px', borderRadius: '12px', backgroundColor: form.name.trim() ? '#f97316' : '#e2e8f0', color: form.name.trim() ? '#fff' : '#94a3b8', border: 'none', fontSize: '15px', fontWeight: 600, cursor: form.name.trim() ? 'pointer' : 'default' }}>
            {saving ? 'Saving...' : 'Save Supplier'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading suppliers...</div>
      ) : suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '32px', margin: '0 0 12px' }}>📦</p>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#334155', margin: 0 }}>No suppliers yet</p>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: '4px 0 0' }}>Add your first supplier to start creating purchase orders</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {suppliers.map((s) => (
            <div key={s.id} style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px 20px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>{s.name}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>{s.contact} · {s.phone}</div>
                {s.gstin && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>GSTIN: {s.gstin}</div>}
              </div>
              <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '8px', backgroundColor: s.isActive ? '#f0fdf4' : '#fef2f2', color: s.isActive ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {s.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
