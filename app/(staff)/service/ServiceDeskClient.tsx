'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  ShieldCheck,
  ShieldAlert,
  Plus,
  User,
  Wrench,
  FileText,
  ArrowRight,
  X,
  AlertCircle,
  CheckCircle2,
  Package,
} from 'lucide-react';
import clsx from 'clsx';
import { apiGet, apiPost } from '@/lib/client-api';
import { formatDateIST } from '@/lib/dates';

// ── Types ───────────────────────────────────────────────────────────────────

interface TicketRow {
  id: string;
  ticketNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  category: string;
  faultCode: string | null;
  description: string;
  priority: string;
  status: string;
  warrantyVerdict: string;
  billingMode: string;
  slaDueAt: string;
  createdAt: string;
  assigneeName: string | null;
}

interface FaultCodeView {
  code: string;
  description: string;
  defaultPriority: string;
}

interface FaultCatalogue {
  totalCodes: number;
  byModel: Record<string, FaultCodeView[]>;
}

interface CustomerResult {
  id: string;
  customerNumber: string;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  address: string;
  installationCount: number;
  activeWarrantiesCount: number;
}

interface UnitResult {
  id: string;
  serialNumber: string;
  qrCode: string;
  productName: string;
  brand: string;
  model: string;
  category: string;
  status: string;
  customerId: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  installationId: string | null;
  warrantyVerdict: string;
  warrantyEndDate?: string | null;
  remainingDays: number;
  isCovered: boolean;
}

interface DocumentResult {
  type: 'ORDER' | 'DISPATCH' | 'TICKET' | 'INVOICE' | 'PURCHASE_ORDER' | 'QUOTE';
  id: string;
  number: string;
  title: string;
  status: string;
  date?: string | null;
  customerId?: string | null;
  customerName?: string | null;
}

interface SearchResponse {
  query: string;
  responseTimeMs: number;
  totalMatches: number;
  customers: CustomerResult[];
  units: UnitResult[];
  documents: DocumentResult[];
}

interface CustomerTicketContext {
  customerId: string;
  customerName: string;
  customerPhone: string;
  installations: Array<{
    id: string;
    orderNumber: string;
    status: string;
    capacityKw: number;
    scheduledOn: string | null;
  }>;
  units: Array<{
    id: string;
    serialNumber: string;
    qrCode: string;
    productName: string;
    brand: string;
    model: string;
    category: string;
    status: string;
    installationId: string | null;
    warrantyVerdict: string;
    warrantyEndDate: string | null;
    remainingDays: number;
  }>;
}

const CATEGORIES = ['NO_POWER', 'FAULT_CODE', 'LOW_GENERATION', 'DAMAGE', 'OTHER'] as const;
const CHANNELS = ['PHONE', 'WHATSAPP', 'VISIT', 'WEB'] as const;
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

function VerdictChip({ verdict }: { verdict: string }) {
  return (
    <span
      className={clsx(
        'px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap',
        verdict === 'IN_WARRANTY'
          ? 'bg-emerald-100 text-emerald-800'
          : verdict === 'OUT_OF_WARRANTY'
          ? 'bg-amber-100 text-amber-800'
          : verdict === 'EXCLUDED'
          ? 'bg-red-100 text-red-800'
          : 'bg-slate-100 text-slate-600'
      )}
    >
      {verdict.replace(/_/g, ' ')}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ServiceDeskClient({
  initialTickets,
  faultCatalogue,
}: {
  initialTickets: TicketRow[];
  faultCatalogue: FaultCatalogue;
}) {
  const router = useRouter();

  // Search state (debounced, real API — FR-7.1 / C9)
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // New ticket modal state (FR-7.3)
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [presetCustomer, setPresetCustomer] = useState<CustomerResult | null>(null);
  const [presetUnitId, setPresetUnitId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const data = await apiGet<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(q.trim())}`);
      setSearchResults(data);
    } catch (err: any) {
      setSearchResults(null);
      setSearchError(err?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(searchTerm);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, runSearch]);

  const openNewTicket = (customer?: CustomerResult, unitId?: string) => {
    setPresetCustomer(customer || null);
    setPresetUnitId(unitId || null);
    setShowNewTicket(true);
  };

  return (
    <div className="space-y-6">
      {/* Search Header Bar */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
            Fast Customer &amp; Serial Number Warranty Search
          </label>
          <button
            type="button"
            onClick={() => openNewTicket()}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Ticket</span>
          </button>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by customer phone (+91...), inverter serial (e.g. INV3K...), name, order or ticket number..."
            className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50"
          />
          {searching && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 animate-pulse">
              searching...
            </span>
          )}
        </div>
        {searchError && (
          <p className="text-[11px] text-red-600 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> {searchError}
          </p>
        )}
      </div>

      {/* Live Search Results (real API results — FR-7.1) */}
      {searchResults && (
        <div className="p-5 rounded-xl border border-blue-200 bg-white shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">
              Search Results — {searchResults.totalMatches} match
              {searchResults.totalMatches === 1 ? '' : 'es'} for “{searchResults.query}”
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {searchResults.responseTimeMs} ms
            </span>
          </div>

          {/* Customers */}
          {searchResults.customers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Customers ({searchResults.customers.length})
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {searchResults.customers.map((c) => (
                  <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-slate-50">
                    <div className="text-xs">
                      <span className="font-bold text-slate-900">{c.name}</span>
                      <span className="text-slate-500 ml-2 font-mono">{c.phone}</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {c.customerNumber} • {c.city} • {c.installationCount} installation
                        {c.installationCount === 1 ? '' : 's'} • {c.activeWarrantiesCount} active warrant
                        {c.activeWarrantiesCount === 1 ? 'y' : 'ies'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/service/customer/${c.id}`}
                        className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1"
                      >
                        Service View <ArrowRight className="w-3 h-3" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => openNewTicket(c)}
                        className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Create ticket
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Units with warranty verdicts */}
          {searchResults.units.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" /> Equipment / Serials ({searchResults.units.length})
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {searchResults.units.map((u) => (
                  <div key={u.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-slate-50">
                    <div className="text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-blue-700">{u.serialNumber}</span>
                        <VerdictChip verdict={u.warrantyVerdict} />
                      </div>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {u.productName} ({u.brand} {u.model}) • {u.status}
                        {u.warrantyEndDate ? ` • warranty till ${u.warrantyEndDate}` : ' • no warranty on record'}
                        {u.isCovered ? ` • ${u.remainingDays} days left` : ''}
                        {u.customerName ? ` • ${u.customerName} (${u.customerPhone})` : ' • unassigned unit'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {u.customerId && (
                        <>
                          <Link
                            href={`/service/customer/${u.customerId}`}
                            className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1"
                          >
                            Service View <ArrowRight className="w-3 h-3" />
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              openNewTicket(
                                {
                                  id: u.customerId!,
                                  customerNumber: '',
                                  name: u.customerName || 'Customer',
                                  phone: u.customerPhone || '',
                                  email: null,
                                  city: '',
                                  address: '',
                                  installationCount: 0,
                                  activeWarrantiesCount: 0,
                                },
                                u.id
                              )
                            }
                            className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Create ticket
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          {searchResults.documents.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Documents ({searchResults.documents.length})
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {searchResults.documents.map((d) => (
                  <div key={`${d.type}-${d.id}`} className="flex items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-slate-50 text-xs">
                    <div>
                      <span className="font-bold text-slate-900 font-mono">{d.number}</span>
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                        {d.type.replace(/_/g, ' ')}
                      </span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {d.title} • {d.status}
                        {d.customerName ? ` • ${d.customerName}` : ''}
                        {d.date ? ` • ${d.date}` : ''}
                      </span>
                    </div>
                    {d.type === 'TICKET' ? (
                      <Link
                        href={`/service/${d.id}`}
                        className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                      >
                        Open ticket <ArrowRight className="w-3 h-3" />
                      </Link>
                    ) : d.customerId ? (
                      <Link
                        href={`/service/customer/${d.customerId}`}
                        className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                      >
                        Service View <ArrowRight className="w-3 h-3" />
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.totalMatches === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">
              No customers, equipment or documents matched this query.
            </p>
          )}
        </div>
      )}

      {/* Tickets List (server-rendered initial results) */}
      <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Recent Breakdown Service Tickets ({initialTickets.length})</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tickets cannot be closed until customer confirms resolution (C9). Search above to find a customer or serial.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="px-3 py-2.5">Ticket No</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Category &amp; Fault</th>
                <th className="px-3 py-2.5">Warranty Verdict</th>
                <th className="px-3 py-2.5">Billing Mode</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">SLA Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {initialTickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No service tickets yet. Use “New Ticket” to raise the first one.
                  </td>
                </tr>
              ) : (
                initialTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono font-bold text-blue-600">
                      <Link href={`/service/${t.id}`} className="hover:underline">
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      <Link href={`/service/customer/${t.customerId}`} className="hover:underline">
                        {t.customerName}
                      </Link>
                      <span className="block text-[10px] text-slate-400">{t.customerPhone}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-slate-800">{t.category.replace(/_/g, ' ')}</span>
                      {t.faultCode && (
                        <span className="ml-1.5 font-mono text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                          {t.faultCode}
                        </span>
                      )}
                      <span className="block text-[10px] text-slate-500 truncate max-w-xs">{t.description}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <VerdictChip verdict={t.warrantyVerdict} />
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{t.billingMode}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded text-[10px] font-bold',
                          t.status === 'OPEN'
                            ? 'bg-blue-100 text-blue-800'
                            : t.status === 'RESOLVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : t.status === 'CLOSED'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-amber-100 text-amber-800'
                        )}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{formatDateIST(t.slaDueAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Ticket Modal (FR-7.3) */}
      {showNewTicket && (
        <NewTicketModal
          faultCatalogue={faultCatalogue}
          presetCustomer={presetCustomer}
          presetUnitId={presetUnitId}
          onClose={() => {
            setShowNewTicket(false);
            setPresetCustomer(null);
            setPresetUnitId(null);
          }}
          onCreated={() => {
            setShowNewTicket(false);
            setPresetCustomer(null);
            setPresetUnitId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── New Ticket Button (reusable launcher for the modal) ─────────────────────

export function NewTicketButton({
  customer,
  faultCatalogue,
  presetUnitId,
  label = 'New Ticket',
  className,
}: {
  customer: { id: string; name: string; phone: string };
  faultCatalogue: FaultCatalogue;
  presetUnitId?: string | null;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          'px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs'
        }
      >
        <Plus className="w-3.5 h-3.5" />
        <span>{label}</span>
      </button>
      {open && (
        <NewTicketModal
          faultCatalogue={faultCatalogue}
          presetCustomer={{
            id: customer.id,
            customerNumber: '',
            name: customer.name,
            phone: customer.phone,
            email: null,
            city: '',
            address: '',
            installationCount: 0,
            activeWarrantiesCount: 0,
          }}
          presetUnitId={presetUnitId || null}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// ── New Ticket Modal ────────────────────────────────────────────────────────

function NewTicketModal({
  faultCatalogue,
  presetCustomer,
  presetUnitId,
  onClose,
  onCreated,
}: {
  faultCatalogue: FaultCatalogue;
  presetCustomer: CustomerResult | null;
  presetUnitId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  // Step 1: pick a customer (skipped when opened from a search result)
  const [customer, setCustomer] = useState<CustomerResult | null>(presetCustomer);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);

  // Step 2: form fields
  const [context, setContext] = useState<CustomerTicketContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [installationId, setInstallationId] = useState('');
  const [unitId, setUnitId] = useState(presetUnitId || '');
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('PHONE');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('NO_POWER');
  const [faultCodeChoice, setFaultCodeChoice] = useState('');
  const [customFaultCode, setCustomFaultCode] = useState('');
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('NORMAL');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    id: string;
    ticketNumber: string;
    warrantyVerdict: string;
    billingMode: string;
    slaDueAt: string;
  } | null>(null);

  // Load equipment context once a customer is chosen
  useEffect(() => {
    if (!customer) {
      setContext(null);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    apiGet<CustomerTicketContext>(`/api/v1/tickets/units?customerId=${customer.id}`)
      .then((data) => {
        if (!cancelled) setContext(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Failed to load customer equipment');
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);

  // Debounced customer mini-search inside the modal
  useEffect(() => {
    if (customer || customerSearch.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const data = await apiGet<SearchResponse>(
          `/api/v1/search?q=${encodeURIComponent(customerSearch.trim())}`
        );
        setCustomerResults(data.customers);
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch, customer]);

  const selectedUnit = context?.units.find((u) => u.id === unitId) || null;
  const effectiveFaultCode =
    category === 'FAULT_CODE'
      ? faultCodeChoice === '__CUSTOM__'
        ? customFaultCode.trim()
        : faultCodeChoice || undefined
      : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        customerId: customer.id,
        channel,
        category,
        description,
        priority,
      };
      if (installationId) payload.installationId = installationId;
      if (unitId) payload.unitId = unitId;
      if (effectiveFaultCode) payload.faultCode = effectiveFaultCode;

      const ticket = await apiPost<any>('/api/v1/tickets', payload);
      setCreated({
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        warrantyVerdict: ticket.warranty_verdict,
        billingMode: ticket.billing_mode,
        slaDueAt: ticket.sla_due_at,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full my-8 p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600" />
            <span>New Service Ticket (FR-7.3)</span>
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        {created ? (
          /* Success panel with the automatic warranty verdict */
          <div className="space-y-4">
            <div
              className={clsx(
                'p-4 rounded-xl border space-y-2',
                created.warrantyVerdict === 'IN_WARRANTY'
                  ? 'border-emerald-300 bg-emerald-50/70'
                  : created.warrantyVerdict === 'EXCLUDED'
                  ? 'border-red-300 bg-red-50/70'
                  : 'border-amber-300 bg-amber-50/70'
              )}
            >
              <div className="flex items-center gap-2">
                {created.warrantyVerdict === 'IN_WARRANTY' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                )}
                <h4 className="text-sm font-bold text-slate-900">
                  Ticket {created.ticketNumber} created — Verdict: {created.warrantyVerdict.replace(/_/g, ' ')}
                </h4>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs bg-white p-3 rounded-lg border border-current/20">
                <div>
                  <span className="text-slate-400 block text-[10px]">Billing Mode</span>
                  <span className="font-bold text-slate-800">
                    {created.billingMode}
                    {created.billingMode === 'WARRANTY' ? ' (No Charge)' : ' (Parts & Labour)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">SLA Due</span>
                  <span className="font-bold text-slate-800">{formatDateIST(created.slaDueAt)}</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              The customer has been notified automatically, and the warranty verdict &amp; billing mode were applied
              automatically per rule C9.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCreated}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Close &amp; refresh list
              </button>
              <Link
                href={`/service/${created.id}`}
                className="px-3.5 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg flex items-center gap-1.5"
              >
                Open ticket <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : !customer ? (
          /* Step 1: customer picker */
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Pick the customer this service request belongs to.</p>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search by phone, name or customer number..."
                className="w-full pl-9 pr-4 py-2.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50"
              />
              {customerSearching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 animate-pulse">
                  searching...
                </span>
              )}
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-72 overflow-y-auto">
              {customerResults.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  {customerSearch.trim().length < 2
                    ? 'Type at least 2 characters to search customers.'
                    : 'No customers found.'}
                </p>
              ) : (
                customerResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCustomer(c)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 text-xs"
                  >
                    <span className="font-bold text-slate-900">{c.name}</span>
                    <span className="text-slate-500 ml-2 font-mono">{c.phone}</span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      {c.customerNumber} • {c.city} • {c.installationCount} installation(s)
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Step 2: ticket form */
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Chosen customer chip */}
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
              <div className="text-xs">
                <span className="font-bold text-slate-900">{customer.name}</span>
                <span className="text-slate-500 ml-2 font-mono">{customer.phone}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomer(null);
                  setContext(null);
                  setUnitId('');
                  setInstallationId('');
                }}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
              >
                Change customer
              </button>
            </div>

            {/* Channel + Category + Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">Category</label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as any);
                    if (e.target.value !== 'FAULT_CODE') {
                      setFaultCodeChoice('');
                      setCustomFaultCode('');
                    }
                  }}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Installation + Unit pickers (drive the warranty verdict) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Installation <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <select
                  value={installationId}
                  onChange={(e) => {
                    setInstallationId(e.target.value);
                    setUnitId('');
                  }}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  disabled={contextLoading}
                >
                  <option value="">
                    {contextLoading ? 'Loading...' : 'Auto-detect from unit'}
                  </option>
                  {context?.installations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.orderNumber} ({i.capacityKw} kW, {i.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Equipment / Unit <span className="text-slate-400 font-normal">(optional — drives verdict)</span>
                </label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  disabled={contextLoading}
                >
                  <option value="">
                    {contextLoading ? 'Loading...' : 'No specific unit'}
                  </option>
                  {context?.units
                    .filter((u) => !installationId || u.installationId === installationId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.serialNumber} — {u.productName} ({u.warrantyVerdict.replace(/_/g, ' ')})
                      </option>
                    ))}
                </select>
                {selectedUnit && (
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5">
                    <Package className="w-3 h-3" />
                    {selectedUnit.brand} {selectedUnit.model} • {selectedUnit.warrantyVerdict.replace(/_/g, ' ')}
                    {selectedUnit.warrantyEndDate ? ` till ${selectedUnit.warrantyEndDate}` : ' (no warranty record)'}
                  </p>
                )}
              </div>
            </div>

            {/* Fault code (DB catalogue grouped by inverter model + free text) */}
            {category === 'FAULT_CODE' && (
              <div className="space-y-2">
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Fault Code <span className="text-slate-400 font-normal">(per-model list from DB)</span>
                </label>
                <select
                  value={faultCodeChoice}
                  onChange={(e) => setFaultCodeChoice(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Select a fault code…</option>
                  {Object.entries(faultCatalogue.byModel).map(([model, codes]) => (
                    <optgroup key={model} label={model}>
                      {codes.map((fc) => (
                        <option key={`${model}-${fc.code}`} value={fc.code}>
                          {fc.code} — {fc.description} ({fc.defaultPriority})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  <option value="__CUSTOM__">Other / custom code (free text)…</option>
                </select>
                {faultCodeChoice === '__CUSTOM__' && (
                  <input
                    type="text"
                    value={customFaultCode}
                    onChange={(e) => setCustomFaultCode(e.target.value)}
                    placeholder="e.g. E999 (read from the inverter display)"
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  />
                )}
                {Object.keys(faultCatalogue.byModel).length === 0 && (
                  <p className="text-[10px] text-slate-400">
                    No fault codes seeded in the database — enter the code as free text.
                  </p>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600">Description</label>
              <textarea
                required
                rows={3}
                minLength={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="What the customer reported (min 5 characters)..."
              />
            </div>

            {error && (
              <p className="text-[11px] text-red-600 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !customer || (category === 'FAULT_CODE' && faultCodeChoice === '__CUSTOM__' && !customFaultCode.trim())}
                className="px-3.5 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {submitting ? 'Creating...' : 'Create Ticket'}
                {!submitting && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
