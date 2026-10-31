'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ShoppingCart, ArrowLeft, Plus, CheckCircle2, 
  AlertTriangle, Clock, CreditCard, ShieldCheck, 
  Package, Calendar, Wrench, X, Check, Truck 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { NextStepPanel } from '@/components/NextStepPanel';
import { MoneyText } from '@/components/MoneyText';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';

interface OrderDetailClientProps {
  initialOrder: any;
}

export default function OrderDetailClient({ initialOrder }: OrderDetailClientProps) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [loading, setLoading] = useState(false);

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubsidyModalOpen, setIsSubsidyModalOpen] = useState(false);

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    amountRupees: Math.max(0, (Number(order.advance_required_paise) - Number(order.paid_paise)) / 100),
    method: 'UPI' as const,
    kind: (order.paid_paise === 0n ? 'ADVANCE' : 'PART') as const,
    reference: '',
    receivedOn: new Date().toISOString().slice(0, 10),
  });

  // Subsidy form state
  const [subsidyForm, setSubsidyForm] = useState({
    status: (order.subsidy?.status || 'NOT_STARTED') as any,
    applicationNumber: order.subsidy?.application_number || '',
    sanctionedAmountRupees: order.subsidy?.sanctioned_amount_paise ? Number(order.subsidy.sanctioned_amount_paise) / 100 : 78000,
    inspectionDate: order.subsidy?.inspection_date ? new Date(order.subsidy.inspection_date).toISOString().slice(0, 10) : '',
    notes: order.subsidy?.notes || '',
  });

  const isConfirmed = order.status !== 'PENDING_ADVANCE';
  const isAdvanceMet = order.paid_paise >= order.advance_required_paise;
  const balanceDuePaise = order.total_paise - order.paid_paise;

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const idempotencyKey = uuidv4();
      const res = await fetch(`/api/v1/orders/${order.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'ACCOUNTS',
        },
        body: JSON.stringify({
          orderId: order.id,
          amountRupees: Number(paymentForm.amountRupees),
          method: paymentForm.method,
          kind: paymentForm.kind,
          reference: paymentForm.reference || undefined,
          receivedOn: paymentForm.receivedOn,
          idempotencyKey,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error?.message || 'Payment recording failed');
        return;
      }

      const data = await res.json();
      setIsPaymentModalOpen(false);
      if (data.autoConfirmed) {
        alert('Advance threshold reached! Order automatically confirmed and inventory reserved.');
      } else {
        alert('Payment recorded successfully.');
      }
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error recording payment');
    } finally {
      setLoading(false);
    }
  };

  const handleDirectorOverride = async () => {
    if (!confirm('Confirm order without full 30% advance threshold? This will reserve warehouse inventory.')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orders/${order.id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'DIRECTOR',
        },
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error?.message || 'Override failed');
        return;
      }
      alert('Order confirmed by Director override. Stock reserved.');
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error confirming order');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSubsidy = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/orders/${order.id}/subsidy`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'ACCOUNTS',
        },
        body: JSON.stringify({
          status: subsidyForm.status,
          applicationNumber: subsidyForm.applicationNumber || undefined,
          sanctionedAmountRupees: Number(subsidyForm.sanctionedAmountRupees) || undefined,
          inspectionDate: subsidyForm.inspectionDate || undefined,
          notes: subsidyForm.notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error?.message || 'Subsidy update failed');
        return;
      }
      setIsSubsidyModalOpen(false);
      alert('Subsidy tracking updated.');
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error updating subsidy');
    } finally {
      setLoading(false);
    }
  };

  // Next Step Config
  const getNextAction = () => {
    switch (order.status) {
      case 'PENDING_ADVANCE':
        return {
          title: 'Collect 30% Advance Payment',
          description: `Collect minimum advance of Rs ${Number(order.advance_required_paise) / 100} to automatically confirm order and reserve warehouse stock.`,
          actionLabel: 'Record Payment',
          onAction: () => setIsPaymentModalOpen(true),
          variant: 'action' as const,
        };
      case 'CONFIRMED':
        return {
          title: 'Warehouse Picking & Dispatch',
          description: 'Order confirmed and inventory reserved. Pick list generated in Dispatch queue.',
          actionLabel: 'Open Dispatch Queue',
          onAction: () => router.push(`/dispatch`),
          variant: 'success' as const,
        };
      case 'READY_TO_DISPATCH':
      case 'DISPATCHED':
        return {
          title: 'Installation On Site',
          description: `Dispatched to site. Field crew lead ${order.installation?.crew_lead?.user?.name || 'Technician'} conducting installation.`,
          actionLabel: 'View Schedule',
          onAction: () => router.push(`/schedule`),
          variant: 'action' as const,
        };
      default:
        return {
          title: 'Order Processing',
          description: `Status: ${order.status}`,
          variant: 'action' as const,
        };
    }
  };

  const nextAction = getNextAction();

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/orders" className="hover:text-blue-600 flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              <span>Orders</span>
            </Link>
            <span>/</span>
            <span className="font-mono font-semibold text-slate-900">{order.order_number}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 font-mono">
              {order.order_number}
            </h1>
            <StageChip stage={order.status} size="md" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-sm"
          >
            <CreditCard className="w-4 h-4" />
            <span>Record Payment</span>
          </button>

          {order.status === 'PENDING_ADVANCE' && (
            <button
              type="button"
              disabled={loading}
              onClick={handleDirectorOverride}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-amber-300 hover:bg-amber-50 text-amber-800 flex items-center gap-1.5"
            >
              <span>Director Override Confirm</span>
            </button>
          )}
        </div>
      </div>

      {/* Sticky Next Step Action Panel (Section 3.1) */}
      <NextStepPanel
        title={nextAction.title}
        description={nextAction.description}
        actionLabel={nextAction.actionLabel}
        onAction={nextAction.onAction}
        variant={nextAction.variant}
      />

      {/* Stage Tracker Stepper */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 text-center text-xs">
          {[
            { key: 'PENDING_ADVANCE', label: '1. Advance' },
            { key: 'CONFIRMED', label: '2. Confirmed' },
            { key: 'READY_TO_DISPATCH', label: '3. Ready' },
            { key: 'DISPATCHED', label: '4. Transit' },
            { key: 'DELIVERED', label: '5. Delivered' },
            { key: 'INSTALLED', label: '6. Installed' },
            { key: 'CLOSED', label: '7. Closed' },
          ].map((st, i) => {
            const isCurrent = order.status === st.key;
            return (
              <div
                key={st.key}
                className={clsx(
                  'p-2.5 rounded-lg border font-medium transition-all',
                  isCurrent
                    ? 'border-blue-600 bg-blue-50 text-blue-800 font-bold'
                    : 'border-slate-100 bg-slate-50 text-slate-500'
                )}
              >
                {st.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer & System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2 text-xs">
          <span className="font-bold text-slate-400 uppercase tracking-wider block">Customer Details</span>
          <div className="font-bold text-slate-900 text-sm">{order.customer.name}</div>
          <div className="text-slate-600">{order.customer.phone}</div>
          <div className="text-slate-600">{order.customer.address}, {order.customer.pincode}</div>
          <div className="pt-2 text-slate-400">
            Quote Ref: <Link href={`/quotes/${order.quote_id}`} className="text-blue-600 font-mono hover:underline">{order.quote?.quote_number}</Link>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2 text-xs">
          <span className="font-bold text-slate-400 uppercase tracking-wider block">Payment Summary</span>
          <div className="flex justify-between">
            <span className="text-slate-500">Order Total:</span>
            <MoneyText paise={order.total_paise} className="font-bold text-slate-900" />
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Paid So Far:</span>
            <MoneyText paise={order.paid_paise} className={isAdvanceMet ? 'text-emerald-700 font-bold' : 'text-amber-800 font-bold'} />
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold">
            <span className="text-slate-500">Balance Due:</span>
            <MoneyText paise={balanceDuePaise} />
          </div>
          <div className="text-[11px] text-slate-400 pt-1">
            Advance Threshold (30%): <MoneyText paise={order.advance_required_paise} />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2 text-xs">
          <span className="font-bold text-slate-400 uppercase tracking-wider block">Installation & Crew</span>
          <div className="text-slate-900 font-semibold">
            Scheduled Date: {order.installation?.scheduled_date ? formatDateIST(order.installation.scheduled_date) : 'Pending Confirmation'}
          </div>
          <div className="text-slate-600">
            Crew Lead: {order.installation?.crew_lead?.user?.name || 'Unassigned'}
          </div>
          <div className="pt-2">
            <Link href="/schedule" className="text-blue-600 font-semibold hover:underline">
              View Schedule & Suggestions →
            </Link>
          </div>
        </div>
      </div>

      {/* Stock Allocation & Shortage Display (FR-4.5 / ADR D3) */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Order Items & Inventory Reservations</h3>
            <p className="text-xs text-slate-500">Stock reserved at order confirmation; dispatched via pick list.</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
            {order.lines.length} Line Items
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5 text-right">Required Qty</th>
                <th className="px-3 py-2.5 text-right">Reserved Qty</th>
                <th className="px-3 py-2.5 text-right">Dispatched Qty</th>
                <th className="px-3 py-2.5 text-right">Status / Shortage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {order.lines.map((l: any) => {
                const required = Number(l.qty);
                const reserved = Number(l.qty_reserved);
                const dispatched = Number(l.qty_dispatched);
                const shortage = required - reserved;

                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {l.description}
                      <span className="block text-[10px] text-slate-400 font-mono">{l.product.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      {required} {l.product.uom}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                      {reserved} {l.product.uom}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">
                      {dispatched} {l.product.uom}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {shortage > 0 && order.status !== 'PENDING_ADVANCE' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                          Shortage: {shortage} {l.product.uom}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">
                          Covered
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments Ledger (FR-4.2) & Subsidy Application (FR-4.8) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payments Ledger */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>Payments Ledger ({order.payments?.length || 0})</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              + Record Payment
            </button>
          </div>

          {(!order.payments || order.payments.length === 0) ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No payments recorded yet. Click "Record Payment" to log UPI, NEFT, cash or cheque.
            </p>
          ) : (
            <div className="space-y-3">
              {order.payments.map((p: any) => (
                <div key={p.id} className="p-3 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">
                      <MoneyText paise={p.amount_paise} />
                    </span>
                    <span className="text-slate-400 mx-2">•</span>
                    <span className="font-medium text-slate-700">{p.method} ({p.kind})</span>
                    {p.reference && (
                      <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                        Ref: {p.reference}
                      </span>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-slate-500">
                    <div>{formatDateIST(p.received_on)}</div>
                    <span className="text-slate-400">By {p.recorder?.name || 'Staff'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subsidy Tracker (FR-4.8) */}
        <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>PM Surya Ghar Subsidy Checklist</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsSubsidyModalOpen(true)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              Update Status
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">Checklist Stage:</span>
              <span className="font-bold text-slate-800">
                {order.subsidy?.status || 'NOT_STARTED'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">National Portal App No:</span>
              <span className="font-mono font-semibold text-slate-800">
                {order.subsidy?.application_number || 'Not Applied'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">DISCOM Inspection Date:</span>
              <span className="font-semibold text-slate-800">
                {order.subsidy?.inspection_date ? formatDateIST(order.subsidy.inspection_date) : 'Pending Inspection'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">Sanctioned Subsidy:</span>
              <span className="font-bold text-emerald-700">
                <MoneyText paise={order.subsidy?.sanctioned_amount_paise} />
              </span>
            </div>
            {order.subsidy?.notes && (
              <p className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                {order.subsidy.notes}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Record Payment Modal (FR-4.2 / ADR D16) */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" />
                <span>Record Customer Payment</span>
              </h2>
              <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (Rupees) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={paymentForm.amountRupees}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amountRupees: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Method *</label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value as any })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="UPI">UPI</option>
                    <option value="NEFT">NEFT / RTGS</option>
                    <option value="CASH">Cash</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="LOAN">Solar Loan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Kind</label>
                  <select
                    value={paymentForm.kind}
                    onChange={(e) => setPaymentForm({ ...paymentForm, kind: e.target.value as any })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ADVANCE">Advance (30%)</option>
                    <option value="PART">Part Payment</option>
                    <option value="FINAL">Final Settlement</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / UTR Number</label>
                <input
                  type="text"
                  placeholder="e.g. UPI-UTR-293847294827"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Received On *</label>
                <input
                  type="date"
                  required
                  value={paymentForm.receivedOn}
                  onChange={(e) => setPaymentForm({ ...paymentForm, receivedOn: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                >
                  {loading ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subsidy Update Modal */}
      {isSubsidyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4">Update Subsidy Status</h2>
            <form onSubmit={handleUpdateSubsidy} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={subsidyForm.status}
                  onChange={(e) => setSubsidyForm({ ...subsidyForm, status: e.target.value as any })}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="NOT_STARTED">Not Started</option>
                  <option value="SUBMITTED">Submitted on National Portal</option>
                  <option value="UNDER_INSPECTION">DISCOM Inspection Scheduled</option>
                  <option value="APPROVED">Subsidy Approved</option>
                  <option value="DISBURSED">Subsidy Disbursed</option>
                  <option value="REJECTED">Application Rejected</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Application Number</label>
                <input
                  type="text"
                  value={subsidyForm.applicationNumber}
                  onChange={(e) => setSubsidyForm({ ...subsidyForm, applicationNumber: e.target.value })}
                  placeholder="e.g. PM-SG-2026-981273"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Inspection Date</label>
                <input
                  type="date"
                  value={subsidyForm.inspectionDate}
                  onChange={(e) => setSubsidyForm({ ...subsidyForm, inspectionDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={subsidyForm.notes}
                  onChange={(e) => setSubsidyForm({ ...subsidyForm, notes: e.target.value })}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSubsidyModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Save Subsidy Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
