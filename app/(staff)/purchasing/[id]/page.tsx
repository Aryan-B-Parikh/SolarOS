/**
 * SunPower Ops - Purchase Order Detail / Edit
 * Phase 3 - Member 3: Operations Frontend
 * Spec: FR-5.8, Backend Schema (purchase_orders, purchase_order_lines)
 */
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface POLine { id: string; productId: string; productName: string; qtyOrdered: number; qtyReceived: number; unitCostPaise: number; }
interface PODetail { id: string; poNumber: string; supplierId: string; supplierName: string; status: string; orderedOn: string; expectedOn: string | null; totalPaise: number; lines: POLine[]; }

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const poId = params.id as string;
  const [po, setPo] = useState<PODetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/purchase-orders/${poId}`)
      .then((r) => r.json()).then(setPo).catch(() => {}).finally(() => setLoading(false));
  }, [poId]);

  function formatMoney(paise: number) {
    return 'Rs ' + Math.round(paise / 100).toLocaleString('en-IN');
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>;
  if (!po) return <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>Purchase order not found</div>;

  const allReceived = po.lines.every((l) => l.qtyReceived >= l.qtyOrdered);

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button onClick={() => router.back()} style={{ minWidth: '44px', minHeight: '44px', borderRadius: '10px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '18px', cursor: 'pointer' }}>&#8592;</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>{po.poNumber}</h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: '2px 0 0' }}>{po.supplierName}</p>
        </div>
        <span style={{ padding: '6px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, backgroundColor: po.status === 'RECEIVED' ? '#f0fdf4' : '#eff6ff', color: po.status === 'RECEIVED' ? '#16a34a' : '#2563eb' }}>{po.status}</span>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{formatMoney(po.totalPaise)}</div>
        </div>
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Ordered</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{po.orderedOn}</div>
        </div>
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Expected</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{po.expectedOn || '-'}</div>
        </div>
      </div>

      {/* Line items */}
      <div style={{ backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Line Items ({po.lines.length})</h2>
        </div>
        {po.lines.map((line, i) => {
          const pct = line.qtyOrdered > 0 ? Math.round((line.qtyReceived / line.qtyOrdered) * 100) : 0;
          return (
            <div key={line.id} style={{ padding: '14px 20px', borderBottom: i < po.lines.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{line.productName}</div>
                  <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                    {line.qtyReceived} / {line.qtyOrdered} received · {formatMoney(line.unitCostPaise)}/unit
                  </div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{formatMoney(line.unitCostPaise * line.qtyOrdered)}</div>
              </div>
              {/* Progress bar */}
              <div style={{ marginTop: '8px', height: '6px', borderRadius: '3px', backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '3px', backgroundColor: pct >= 100 ? '#16a34a' : pct > 0 ? '#f59e0b' : '#e2e8f0', width: `${Math.min(pct, 100)}%`, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Receive stock button */}
      {!allReceived && po.status !== 'CANCELLED' && (
        <button onClick={() => router.push(`/purchasing/receive?poId=${po.id}`)}
          style={{ width: '100%', minHeight: '52px', marginTop: '20px', borderRadius: '14px', backgroundColor: '#f97316', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}>
          Receive Stock Against This PO
        </button>
      )}
    </div>
  );
}
