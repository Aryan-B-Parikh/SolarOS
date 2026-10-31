'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  CreditCard, FileText, Receipt, Users, Plus, 
  X, Check, AlertTriangle, ShieldCheck, Download 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

interface AccountsClientProps {
  payments: any[];
  invoices: any[];
  expenses: any[];
  orders: any[];
  technicians: any[];
}

export default function AccountsClient({
  payments,
  invoices,
  expenses,
  orders,
  technicians,
}: AccountsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'INVOICES' | 'EXPENSES' | 'PAYROLL' | 'SUBSIDY'>('PAYMENTS');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    category: 'MATERIALS',
    amountRupees: 5000,
    orderId: orders[0]?.id || '',
    description: '',
    incurredOn: new Date().toISOString().slice(0, 10),
  });

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'ACCOUNTS',
        },
        body: JSON.stringify({
          category: expenseForm.category,
          amountRupees: Number(expenseForm.amountRupees),
          orderId: expenseForm.orderId || undefined,
          description: expenseForm.description,
          incurredOn: expenseForm.incurredOn,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error?.message || 'Failed to record expense');
        return;
      }

      setIsExpenseModalOpen(false);
      setExpenseForm({
        category: 'MATERIALS',
        amountRupees: 5000,
        orderId: orders[0]?.id || '',
        description: '',
        incurredOn: new Date().toISOString().slice(0, 10),
      });
      alert('Expense recorded successfully.');
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error recording expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-2">
          {[
            { key: 'PAYMENTS', label: 'Payments Ledger', count: payments.length },
            { key: 'INVOICES', label: 'Invoices', count: invoices.length },
            { key: 'EXPENSES', label: 'Project Expenses', count: expenses.length },
            { key: 'PAYROLL', label: 'Technician Pay (FR-8.5)', count: technicians.length },
            { key: 'SUBSIDY', label: 'Subsidy Status', count: orders.length },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={clsx(
                'px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5',
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {activeTab === 'EXPENSES' && (
          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Expense</span>
          </button>
        )}
      </div>

      {/* Tab Content: Payments */}
      {activeTab === 'PAYMENTS' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Method & Kind</th>
                <th className="px-4 py-3">Reference / UTR</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-bold text-blue-600">
                    <Link href={`/orders/${p.order_id}`}>{p.order?.order_number}</Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{p.order?.customer?.name}</td>
                  <td className="px-4 py-3 font-bold text-emerald-700">
                    <MoneyText paise={p.amount_paise} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-800">{p.method}</span> • {p.kind}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-500">{p.reference || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateIST(p.received_on)}</td>
                  <td className="px-4 py-3 text-slate-400">{p.recorder?.name || 'Staff'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab Content: Invoices */}
      {activeTab === 'INVOICES' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-4 py-3">Invoice Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Taxable</th>
                <th className="px-4 py-3 text-right">GST</th>
                <th className="px-4 py-3 text-right">Total Amount</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No invoices generated yet.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">{inv.invoice_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{inv.customer?.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {inv.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MoneyText paise={inv.subtotal_paise} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MoneyText paise={inv.tax_paise} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      <MoneyText paise={inv.total_paise} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateIST(inv.issue_date)}</td>
                    <td className="px-4 py-3">
                      <StageChip stage={inv.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab Content: Expenses (FR-8.4) */}
      {activeTab === 'EXPENSES' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Project / Order</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Incurred Date</th>
                <th className="px-4 py-3">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No expenses recorded yet.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{e.category}</td>
                    <td className="px-4 py-3 font-mono text-blue-600">
                      {e.order?.order_number || 'General Overhead'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.description}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      <MoneyText paise={e.amount_paise} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateIST(e.incurred_on)}</td>
                    <td className="px-4 py-3 text-slate-400">{e.recorder?.name || 'Staff'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab Content: Technician Pay Summary (FR-8.5 / A9) */}
      {activeTab === 'PAYROLL' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-xs uppercase text-slate-700">Monthly Technician Hours & Compensation</h3>
              <p className="text-[11px] text-slate-500">Payable = Total Logged Hours × Hourly Cost Rate (Assumption A9)</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">Period: Current Month (IST)</span>
          </div>
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-4 py-3">Technician</th>
                <th className="px-4 py-3">Role / Skills</th>
                <th className="px-4 py-3 text-right">Hourly Rate</th>
                <th className="px-4 py-3 text-right">Logged Hours</th>
                <th className="px-4 py-3 text-right">Total Payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {technicians.map((t) => {
                // Compute hours from time_logs
                const hours = (t.time_logs || []).reduce((acc: number, log: any) => {
                  if (log.started_at && log.ended_at) {
                    const diffHours = (new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / (1000 * 60 * 60);
                    return acc + diffHours;
                  }
                  return acc + 6; // default 6h if completed
                }, 0);

                const hourlyPaise = BigInt(t.hourly_cost_paise || 25000); // default Rs 250/hr
                const totalPayablePaise = BigInt(Math.round(hours * Number(hourlyPaise)));

                return (
                  <tr key={t.user_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{t.user?.name}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {t.is_crew_lead ? 'Crew Lead' : 'Technician'} • {t.skills?.join(', ') || 'Standard'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MoneyText paise={hourlyPaise} /> / hr
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{hours.toFixed(1)} hrs</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      <MoneyText paise={totalPayablePaise} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab Content: Subsidy Tracking (FR-4.8) */}
      {activeTab === 'SUBSIDY' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Subsidy Stage</th>
                <th className="px-4 py-3">National Portal App No</th>
                <th className="px-4 py-3 text-right">Sanctioned Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-bold text-blue-600">
                    <Link href={`/orders/${o.id}`}>{o.order_number}</Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{o.customer?.name}</td>
                  <td className="px-4 py-3 font-semibold">{o.capacity_kw} kW</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Active
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">PM-SG-2026-981</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-700">
                    Rs 78,000
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                <span>Record Project Expense (FR-8.4)</span>
              </h2>
              <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="text-slate-400 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="MATERIALS">Materials</option>
                  <option value="LABOUR">Labour</option>
                  <option value="TRANSPORT">Transport & Freight</option>
                  <option value="PERMITS">DISCOM / CEIG Permits</option>
                  <option value="MISC">Miscellaneous</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (Rupees) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={expenseForm.amountRupees}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amountRupees: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Link to Project / Order</label>
                <select
                  value={expenseForm.orderId}
                  onChange={(e) => setExpenseForm({ ...expenseForm, orderId: e.target.value })}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">General (No specific order)</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number} — {o.customer?.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Additional conduit pipes and transport surcharge"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Incurred On *</label>
                <input
                  type="date"
                  required
                  value={expenseForm.incurredOn}
                  onChange={(e) => setExpenseForm({ ...expenseForm, incurredOn: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
