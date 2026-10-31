'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Plus, PhoneCall, Globe, MessageSquare, MapPin, 
  Clock, AlertTriangle, ShieldAlert, User, Search, X
} from 'lucide-react';
import { StageChip } from '@/components/StageChip';
import { MoneyText } from '@/components/MoneyText';
import clsx from 'clsx';

interface LeadBoardClientProps {
  salesUsers: { id: string; name: string }[];
  initialLeads: any[];
}

export default function LeadBoardClient({ salesUsers, initialLeads }: LeadBoardClientProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOwner, setSelectedOwner] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Quick Enquiry Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    city: 'Ahmedabad',
    pincode: '',
    source: 'PHONE',
    requestedCapacityKw: 3,
    systemTypePref: 'ON_GRID',
    wantsSubsidy: true,
    monthlyBillRupees: 3000,
    ownerId: salesUsers[0]?.id || '',
  });

  const handleCreateEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'SALES',
          'x-user-id': formData.ownerId,
        },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          state: 'Gujarat',
          pincode: formData.pincode,
          source: formData.source,
          requestedCapacityKw: Number(formData.requestedCapacityKw),
          systemTypePref: formData.systemTypePref,
          wantsSubsidy: formData.wantsSubsidy,
          monthlyBillRupees: Number(formData.monthlyBillRupees),
          consent: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error?.message || 'Failed to create lead');
        return;
      }

      setIsModalOpen(false);
      setFormData({
        name: '',
        phone: '',
        address: '',
        city: 'Ahmedabad',
        pincode: '',
        source: 'PHONE',
        requestedCapacityKw: 3,
        systemTypePref: 'ON_GRID',
        wantsSubsidy: true,
        monthlyBillRupees: 3000,
        ownerId: salesUsers[0]?.id || '',
      });
      router.refresh();
    } catch (err: any) {
      alert(err.message || 'Error creating lead');
    } finally {
      setLoading(false);
    }
  };

  // Filter leads
  const filteredLeads = initialLeads.filter((lead) => {
    if (selectedOwner !== 'ALL' && lead.owner_id !== selectedOwner) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const matchName = lead.customer?.name?.toLowerCase().includes(s);
      const matchPhone = lead.customer?.phone?.includes(s);
      const matchNum = lead.lead_number?.toLowerCase().includes(s);
      if (!matchName && !matchPhone && !matchNum) return false;
    }
    return true;
  });

  const stages = [
    { key: 'NEW', title: 'New Enquiries', desc: 'Awaiting initial contact (4h SLA)' },
    { key: 'CONTACTED', title: 'Contacted', desc: 'Call logged, qualification pending' },
    { key: 'QUALIFIED', title: 'Qualified', desc: 'Ready for site survey booking' },
    { key: 'SURVEY_SCHEDULED', title: 'Survey Scheduled', desc: 'Surveyor assigned' },
    { key: 'SURVEY_APPROVED', title: 'Survey Approved', desc: 'Ready for quotation' },
    { key: 'QUOTED', title: 'Quoted', desc: 'Quote sent, awaiting customer' },
    { key: 'WON', title: 'Won', desc: 'Quote accepted, order initiated' },
    { key: 'LOST', title: 'Lost / Closed', desc: 'Closed with reason' },
  ];

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'WEB':
        return (
          <span title="Web Form">
            <Globe className="w-3.5 h-3.5 text-blue-500" />
          </span>
        );
      case 'WHATSAPP':
        return (
          <span title="WhatsApp Enquiry">
            <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
          </span>
        );
      case 'PHONE':
        return (
          <span title="Phone Call">
            <PhoneCall className="w-3.5 h-3.5 text-indigo-500" />
          </span>
        );
      default:
        return (
          <span title={source}>
            <User className="w-3.5 h-3.5 text-slate-400" />
          </span>
        );
    }
  };

  const isSlaBreached = (lead: any) => {
    if (lead.status !== 'NEW') return false;
    if (!lead.sla_due_at) return false;
    return new Date(lead.sla_due_at).getTime() < Date.now();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter leads..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Owner Dropdown */}
        <select
          value={selectedOwner}
          onChange={(e) => setSelectedOwner(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-700"
        >
          <option value="ALL">All Sales Owners</option>
          {salesUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {/* Quick Log Enquiry Button */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Log Enquiry (&lt;30s)</span>
        </button>
      </div>

      {/* Kanban Board Container */}
      <div className="w-full overflow-x-auto pb-6 mt-6">
        <div className="flex gap-4 min-w-[1400px]">
          {stages.map((st) => {
            const stageLeads = filteredLeads.filter((l) => l.status === st.key);
            return (
              <div key={st.key} className="w-72 shrink-0 flex flex-col bg-slate-100/70 rounded-xl border border-slate-200/80 p-3">
                {/* Column Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-700">{st.title}</span>
                    <span className="px-1.5 py-0.5 text-[11px] font-bold rounded-full bg-slate-200 text-slate-700">
                      {stageLeads.length}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">{st.desc}</p>

                {/* Cards List */}
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[70vh]">
                  {stageLeads.length === 0 ? (
                    <div className="p-4 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      No leads
                    </div>
                  ) : (
                    stageLeads.map((lead) => {
                      const overdue = isSlaBreached(lead);
                      const hasDuplicates = lead.duplicate_flags && lead.duplicate_flags.length > 0;

                      return (
                        <Link
                          key={lead.id}
                          href={`/leads/${lead.id}`}
                          className={clsx(
                            'block p-3.5 rounded-lg bg-white border shadow-2xs hover:shadow-sm transition-all hover:border-blue-400 text-left group',
                            overdue ? 'border-amber-300 ring-1 ring-amber-300' : 'border-slate-200'
                          )}
                        >
                          {/* Top Row: Number, Source, SLA */}
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="text-[11px] font-mono font-semibold text-slate-500 group-hover:text-blue-600 transition-colors">
                              {lead.lead_number}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {getSourceIcon(lead.source)}
                              {overdue && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800" title="SLA Breached (>4h uncontacted)">
                                  <Clock className="w-3 h-3 text-amber-700" />
                                  <span>SLA Breach</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Customer Name */}
                          <div className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                            {lead.customer?.name}
                          </div>

                          {/* Phone & City */}
                          <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                            <span>{lead.customer?.phone}</span>
                            <span>•</span>
                            <span className="truncate">{lead.customer?.city || 'Gujarat'}</span>
                          </div>

                          {/* Capacity & System */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">
                              {lead.requested_capacity_kw ? `${lead.requested_capacity_kw} kW` : '3 kW'} {lead.system_type_pref === 'OFF_GRID' ? 'Off-Grid' : 'On-Grid'}
                            </span>
                            <span className="text-slate-400 text-[11px]">
                              {lead.owner?.name ? lead.owner.name.split(' ')[0] : 'Unassigned'}
                            </span>
                          </div>

                          {/* Duplicate Flag Alert */}
                          {hasDuplicates && (
                            <div className="mt-2 flex items-center gap-1 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-800">
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Address duplicate flag</span>
                            </div>
                          )}
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Enquiry Modal (FR-1.2) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" />
                <span>Log New Enquiry (&lt;30 Seconds)</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEnquiry} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Ramesh Patel"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address *</label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Plot 12, Shivalik Society, SG Highway"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Code *</label>
                  <input
                    type="text"
                    required
                    pattern="\d{6}"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    placeholder="380054"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Source</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="PHONE">Phone Call</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="WALK_IN">Walk In</option>
                    <option value="REFERRAL">Referral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Capacity</label>
                  <select
                    value={formData.requestedCapacityKw}
                    onChange={(e) => setFormData({ ...formData, requestedCapacityKw: Number(e.target.value) })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value={1}>1 kW</option>
                    <option value={2}>2 kW</option>
                    <option value={3}>3 kW</option>
                    <option value={4}>4 kW</option>
                    <option value={5}>5 kW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">System Type</label>
                  <select
                    value={formData.systemTypePref}
                    onChange={(e) => setFormData({ ...formData, systemTypePref: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="ON_GRID">On-Grid</option>
                    <option value="OFF_GRID">Off-Grid</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Bill (Rs)</label>
                  <input
                    type="number"
                    value={formData.monthlyBillRupees}
                    onChange={(e) => setFormData({ ...formData, monthlyBillRupees: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sales Owner</label>
                  <select
                    value={formData.ownerId}
                    onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {salesUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:ring-2 focus:ring-blue-500"
                >
                  {loading ? 'Creating...' : 'Create Lead & Start SLA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

