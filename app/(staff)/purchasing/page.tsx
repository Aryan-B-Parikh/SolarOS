/**
 * SunPower Ops - Purchase Orders List
 * Phase 3 - Member 3: Operations Frontend
 * Spec: FR-5.8, Backend Schema (purchase_orders, purchase_order_lines)
 */
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type POStatus = 'DRAFT' | 'OPEN' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierName: string;
  status: POStatus;
  orderedOn: string;
  expectedOn: string | null;
  totalPaise: number;
  lineCount: number;
}

const STATUS_STYLES: Record<POStatus, { bg: string; color: string }> = {
  DRAFT: { bg: '#f1f5f9', color: '#475569' },
  OPEN: { bg: '#eff6ff', color: '#2563eb' },
  PARTIAL: { bg: '#fefce8', color: '#ca8a04' },
  RECEIVED: { bg: '#f0fdf4', color: '#16a34a' },
  CANCELLED: { bg: '#fef2f2', color: '#dc2626' },
};

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<POStatus | 'ALL'>('ALL');

  useEffect(() => {
    fetch('/api/v1/purchase-orders')
      .then((r) => r.json())
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'ALL' ? orders : orders.filter((o) => o.status === filter);

  function formatMoney(paise: number) {
    const rupees = Math.round(paise / 100);
    return 'Rs ' + rupees.toLocaleString('en-IN');
  }

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#0f172a' }}>Purchase Orders</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>{filtered.length} orders</p>
        </div>
        <Link href="/purchasing/new"
          style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px', padding: '10px 20px', borderRadius: '12px', backgroundColor: '#f97316', color: '#fff', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
          + New PO
        </Link>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
        {(['ALL', 'DRAFT', 'OPEN', 'PARTIAL', 'RECEIVED', 'CANCELLED'] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: '8px 16px', borderRadius: '10px', border: filter === s ? '2px solid #f97316' : '1px solid #e2e8f0', backgroundColor: filter === s ? '#fff7ed' : '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', color: filter === s ? '#f97316' : '#64748b' }}>
            {s === 'ALL' ? `All (${orders.length})` : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <p style={{ fontSize: '32px', margin: '0 0 12px' }}>📋</p>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#334155', margin: 0 }}>No purchase orders</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map((po) => {
            const st = STATUS_STYLES[po.status];
            return (
              <Link key={po.id} href={`/purchasing/${po.id}`}
                style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px 20px', border: '1px solid #e2e8f0', textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{po.poNumber}</span>
                    <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '8px', backgroundColor: st.bg, color: st.color, fontWeight: 600 }}>{po.status}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>{po.supplierName} · {po.lineCount} items</div>
                  {po.expectedOn && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Expected: {po.expectedOn}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{formatMoney(po.totalPaise)}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{po.orderedOn}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
