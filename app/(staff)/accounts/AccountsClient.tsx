'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  CreditCard, FileText, Receipt, Users, Plus, 
  X, Check, AlertTriangle, ShieldCheck, Download, Loader2 
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import { formatDateIST } from '@/lib/dates';
import clsx from 'clsx';

/** Row from GET /api/v1/analytics/technician-pay (FR-8.5 / A9). */
interface TechnicianPayRow {
  technicianId: string;
  technicianName: string;
  technicianPhone: string;
  totalLoggedHours: number;
  hourlyCostPaise: string;
  totalPayablePaise: string;
  jobCount: number;
}

/** Row from GET /api/v1/analytics/subsidy-summary (FR-4.8 / C11). */
interface SubsidyRow {
  subsidyId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  capacityKw: number;
  status:
    | 'NOT_STARTED'
    | 'SUBMITTED'
    | 'UNDER_INSPECTION'
    | 'APPROVED'
    | 'DISBURSED'
    | 'REJECTED';
  applicationRef: string | null;
  expectedPaise: string;
  receivedPaise: string;
  submittedOn: string | null;
  disbursedOn: string | null;
}

const SUBSIDY_STATUS_STYLES: Record<SubsidyRow['status'], string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700 border-slate-200',
  SUBMITTED: 'bg-blue-50 text-blue-800 border-blue-200',
  UNDER_INSPECTION: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  DISBURSED: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
  REJECTED: 'bg-red-50 text-red-800 border-red-200',
};

interface AccountsClientProps {
  payments: any[];
  invoices: any[];
  expenses: any[];
  orders: any[];
  technicians: any[];
}

export default function AccountsClient({
  payments = [],
  invoices = [],
  expenses = [],
  orders = [],
  technicians = [],
}: AccountsClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'PAYMENTS' | 'INVOICES' | 'EXPENSES' | 'PAYROLL' | 'SUBSIDY'>('PAYMENTS');
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Real payroll data (FR-8.5): fetched from the technician-pay analytics
  // endpoint - no client-side recomputation or default hourly rates.
  const [payroll, setPayroll] = useState<TechnicianPayRow[] | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState<string | null>(null);

  // Real subsidy applications (C11 / FR-4.8).
  const [subsidies, setSubsidies] = useState<SubsidyRow[] | null>(null);
  const [subsidyLoading, setSubsidyLoading] = useState(false);
  const [subsidyError, setSubsidyError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'PAYROLL' || payroll !== null || payrollLoading) return;
    let cancelled = false;
    setPayrollLoading(true);
    setPayrollError(null);
    fetch('/api/v1/analytics/technician-pay?period=THIS_MONTH', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error?.message || 'Failed to load technician pay summary');
        }
        return res.json();
      })
      .then((data: TechnicianPayRow[]) => {
        if (!cancelled) setPayroll(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setPayrollError(err.message || 'Failed to load technician pay summary');
      })
      .finally(() => {
        if (!cancelled) setPayrollLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, payroll, payrollLoading]);

  useEffect(() => {
    if (activeTab !== 'SUBSIDY' || subsidies !== null || subsidyLoading) return;
    let cancelled = false;
    setSubsidyLoading(true);
    setSubsidyError(null);
    fetch('/api/v1/analytics/subsidy-summary', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error?.message || 'Failed to load subsidy applications');
        }
        return res.json();
      })
      .then((data: { subsidies: SubsidyRow[] }) => {
        if (!cancelled) setSubsidies(data.subsidies);
      })
      .catch((err: Error) => {
        if (!cancelled) setSubsidyError(err.message || 'Failed to load subsidy applications');
      })
      .finally(() => {
        if (!cancelled) setSubsidyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, subsidies, subsidyLoading]);

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

      {/* Tab Content: Technician Pay Summary (FR-8.5 / A9) - real logged hours */}
      {activeTab === 'PAYROLL' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-xs uppercase text-slate-700">Monthly Technician Hours &amp; Compensation</h3>
              <p className="text-[11px] text-slate-500">Payable = Logged Hours (time logs) &times; Hourly Cost Rate (Assumption A9)</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">Period: Current Month (IST)</span>
          </div>
          {payrollError && (
            <p className="p-4 text-xs text-red-700 bg-red-50 border-b border-red-100">{payrollError}</p>
          )}
          {payrollLoading ? (
            <p className="py-10 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading technician pay from analytics&hellip;
            </p>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="px-4 py-3">Technician</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3 text-right">Hourly Rate</th>
                  <th className="px-4 py-3 text-right">Logged Hours</th>
                  <th className="px-4 py-3 text-right">Jobs</th>
                  <th className="px-4 py-3 text-right">Total Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {!payroll || payroll.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No completed time logs this month. Payroll appears once technicians clock out of installations.
                    </td>
                  </tr>
                ) : (
                  payroll.map((t) => (
                    <tr key={t.technicianId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{t.technicianName}</td>
                      <td className="px-4 py-3 text-slate-500">{t.technicianPhone || '\u2014'}</td>
                      <td className="px-4 py-3 text-right">
                        <MoneyText paise={BigInt(t.hourlyCostPaise)} /> / hr
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{t.totalLoggedHours.toFixed(1)} hrs</td>
                      <td className="px-4 py-3 text-right text-slate-500">{t.jobCount}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        <MoneyText paise={BigInt(t.totalPayablePaise)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab Content: Subsidy Tracking (FR-4.8 / C11) - real applications */}
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
                <th className="px-4 py-3 text-right">Expected Amount</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3">Disbursed On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {subsidyError ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-red-600 text-xs">{subsidyError}</td>
                </tr>
              ) : subsidyLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading subsidy applications&hellip;
                    </span>
                  </td>
                </tr>
              ) : !subsidies || subsidies.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No subsidy applications recorded yet. Track PM Surya Ghar filings from an order&apos;s Subsidy tab.
                  </td>
                </tr>
              ) : (
                subsidies.map((s) => (
                  <tr key={s.subsidyId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-blue-600">
                      <Link href={`/orders/${s.orderId}`}>{s.orderNumber}</Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.customerName}</td>
                    <td className="px-4 py-3 font-semibold">{s.capacityKw} kW</td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded text-[10px] font-semibold border',
                          SUBSIDY_STATUS_STYLES[s.status]
                        )}
                      >
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600">{s.applicationRef || '\u2014'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      <MoneyText paise={BigInt(s.expectedPaise)} />
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700 font-medium">
                      <MoneyText paise={BigInt(s.receivedPaise)} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{s.disbursedOn ? formatDateIST(s.disbursedOn) : '\u2014'}</td>
                  </tr>
                ))
              )}
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

