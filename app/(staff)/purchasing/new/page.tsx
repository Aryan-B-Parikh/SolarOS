/**
 * SunPower Ops - Create Purchase Order
 * Phase 3 - Member 3: Operations Frontend
 * Spec: FR-5.8
 */
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Supplier { id: string; name: string; }
interface Product { id: string; name: string; sku: string; stdCostPaise: number; }

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderedOn, setOrderedOn] = useState(new Date().toISOString().split('T')[0]);
  const [expectedOn, setExpectedOn] = useState('');
  const [lines, setLines] = useState<Array<{ productId: string; productName: string; qtyOrdered: number; unitCostRupees: number }>>([
    { productId: '', productName: '', qtyOrdered: 1, unitCostRupees: 0 }
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/v1/suppliers')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSuppliers(data);
          if (data.length > 0) setSupplierId(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  function updateLine(index: number, field: string, val: any) {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', productName: '', qtyOrdered: 1, unitCostRupees: 0 }]);
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const totalRupees = lines.reduce((sum, l) => sum + (l.qtyOrdered || 0) * (l.unitCostRupees || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!supplierId) {
      setError('Please select a supplier');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplierId,
        orderedOn,
        expectedOn: expectedOn || undefined,
        lines: lines.map((l) => ({
          productId: l.productId || crypto.randomUUID(), // fallback if custom sku
          qtyOrdered: Number(l.qtyOrdered),
          unitCostPaise: Math.round(Number(l.unitCostRupees) * 100),
        })),
      };

      const res = await fetch('/api/v1/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.message || 'Failed to create PO');
      }

      const po = await res.json();
      router.push(`/purchasing/${po.id || ''}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button onClick={() => router.back()} type="button"
          style={{ minWidth: '44px', minHeight: '44px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '18px', cursor: 'pointer' }}>
          &#8592;
        </button>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Create Purchase Order</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '2px 0 0' }}>Order equipment and materials from verified suppliers</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Supplier & Dates */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Supplier *</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
              style={{ width: '100%', minHeight: '44px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', backgroundColor: '#fff' }}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Order Date</label>
              <input type="date" value={orderedOn} onChange={(e) => setOrderedOn(e.target.value)}
                style={{ width: '100%', minHeight: '44px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Expected Delivery</label>
              <input type="date" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)}
                style={{ width: '100%', minHeight: '44px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px' }} />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Line Items</h2>
            <button type="button" onClick={addLine}
              style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #f97316', backgroundColor: '#fff7ed', color: '#ea580c', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              + Add Item
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {lines.map((line, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                <input placeholder="Product or SKU name" value={line.productName} onChange={(e) => updateLine(idx, 'productName', e.target.value)}
                  style={{ minHeight: '44px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                <input type="number" placeholder="Qty" value={line.qtyOrdered} min={1} onChange={(e) => updateLine(idx, 'qtyOrdered', Number(e.target.value))}
                  style={{ minHeight: '44px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                <input type="number" placeholder="Cost (Rs)" value={line.unitCostRupees} min={0} onChange={(e) => updateLine(idx, 'unitCostRupees', Number(e.target.value))}
                  style={{ minHeight: '44px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
                <button type="button" onClick={() => removeLine(idx)} disabled={lines.length <= 1}
                  style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#ef4444', cursor: lines.length > 1 ? 'pointer' : 'default' }}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#475569' }}>Total Estimated Amount:</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Rs {totalRupees.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {error && <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '14px' }}>{error}</div>}

        <button type="submit" disabled={saving}
          style={{ width: '100%', minHeight: '52px', borderRadius: '14px', backgroundColor: saving ? '#94a3b8' : '#f97316', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 700, cursor: saving ? 'default' : 'pointer', boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}>
          {saving ? 'Creating Purchase Order...' : 'Submit Purchase Order'}
        </button>
      </form>
    </div>
  );
}
