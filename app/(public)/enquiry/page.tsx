'use client';

import React, { useState } from 'react';

export default function PublicEnquiryPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    leadNumber: string;
    portalUrl: string;
    rawToken: string;
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    addressLine2: '',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '',
    requestedCapacityKw: 3,
    systemTypePref: 'ON_GRID' as 'ON_GRID' | 'OFF_GRID',
    wantsSubsidy: true,
    monthlyBillRupees: 3000,
    consent: true,
    honeypot: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.name.trim() || formData.name.length < 2) {
      setError('Please provide your full name (at least 2 characters).');
      return;
    }
    if (!formData.phone.trim() || !/^\+?[1-9]\d{9,14}$/.test(formData.phone.replace(/[\s-]/g, ''))) {
      setError('Please provide a valid 10-digit mobile number.');
      return;
    }
    if (!formData.address.trim()) {
      setError('Street address is required for solar roof orientation assessment.');
      return;
    }
    if (!formData.pincode.trim() || !/^\d{6}$/.test(formData.pincode)) {
      setError('Valid 6-digit PIN code is required.');
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.consent) {
      setError('You must consent to being contacted by SunPower.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/public/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          phone: formData.phone.startsWith('+') ? formData.phone : `+91${formData.phone.replace(/\D/g, '').slice(-10)}`,
          requestedCapacityKw: Number(formData.requestedCapacityKw),
          monthlyBillRupees: Number(formData.monthlyBillRupees),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error?.message || 'Failed to submit enquiry');
      }

      setSubmittedResult(json);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submittedResult) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold">
            ✓
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Enquiry Received!</h1>
          <p className="text-slate-600 text-sm mt-2">
            Your reference number is{' '}
            <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
              {submittedResult.leadNumber}
            </span>
          </p>
          <p className="text-slate-500 text-xs mt-3 leading-relaxed">
            Our solar engineers will review your shadow-free roof area and contact you within 2 business hours.
          </p>
          <div className="mt-8 pt-6 border-t border-slate-100">
            <a
              href={`/portal/${submittedResult.rawToken}`}
              className="inline-block w-full py-3.5 px-6 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-sm transition shadow-md shadow-amber-200"
            >
              Open My SunPower Portal →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-amber-200 text-2xl font-black">
            ☀️
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Go Solar with SunPower
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Get an instant AI site assessment & customized rooftop solar quotation.
          </p>
        </div>

        {/* Form Container */}
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 sm:p-8">
          {/* Progress Indicators */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === 1 ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                }`}
              >
                1
              </span>
              <span className="text-xs font-bold text-slate-800">Contact Details</span>
            </div>
            <div className="h-0.5 w-12 bg-slate-200" />
            <div className="flex items-center space-x-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === 2 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                2
              </span>
              <span className={`text-xs font-bold ${step === 2 ? 'text-slate-800' : 'text-slate-400'}`}>
                Solar Needs
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleNext} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Ramesh Patel"
                  required
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Mobile Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="e.g. 9825000001"
                  required
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="e.g. ramesh@example.com"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Street Address *
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="e.g. 14, Shanti Nagar, Bodakdev"
                  required
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">PIN Code *</label>
                  <input
                    type="text"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleChange}
                    placeholder="380054"
                    maxLength={6}
                    required
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-4 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl text-sm transition shadow-md shadow-amber-200"
              >
                Continue to Solar Needs →
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Capacity Chips */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                  System Capacity (kW)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, requestedCapacityKw: kw }))}
                      className={`py-2 text-xs font-bold rounded-xl border transition ${
                        formData.requestedCapacityKw === kw
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {kw} kW
                    </button>
                  ))}
                </div>
              </div>

              {/* System Type Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">System Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, systemTypePref: 'ON_GRID' }))}
                    className={`p-3 text-left rounded-xl border transition ${
                      formData.systemTypePref === 'ON_GRID'
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-800">On-Grid System</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Connected with net-metering</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, systemTypePref: 'OFF_GRID' }))}
                    className={`p-3 text-left rounded-xl border transition ${
                      formData.systemTypePref === 'OFF_GRID'
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-800">Off-Grid System</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">With battery backup</div>
                  </button>
                </div>
              </div>

              {/* Monthly Electricity Bill */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Average Monthly Bill (₹)
                </label>
                <input
                  type="number"
                  name="monthlyBillRupees"
                  value={formData.monthlyBillRupees}
                  onChange={handleChange}
                  min={500}
                  step={500}
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Subsidy Preference */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-slate-800">PM Surya Ghar Subsidy</div>
                  <div className="text-[11px] text-slate-500">Apply for government rooftop solar subsidy</div>
                </div>
                <input
                  type="checkbox"
                  name="wantsSubsidy"
                  checked={formData.wantsSubsidy}
                  onChange={handleChange}
                  className="w-4 h-4 text-amber-500 rounded focus:ring-amber-400"
                />
              </div>

              {/* Mandatory Consent Checkbox */}
              <div className="flex items-start space-x-2 pt-2">
                <input
                  type="checkbox"
                  name="consent"
                  id="consent"
                  checked={formData.consent}
                  onChange={handleChange}
                  required
                  className="mt-0.5 w-4 h-4 text-amber-500 rounded focus:ring-amber-400"
                />
                <label htmlFor="consent" className="text-xs text-slate-600 leading-tight">
                  I consent to receive solar quotations and survey coordination calls/messages from SunPower.
                </label>
              </div>

              {/* Honeypot field (hidden bot trap) */}
              <input
                type="text"
                name="honeypot"
                value={formData.honeypot}
                onChange={handleChange}
                style={{ display: 'none' }}
                tabIndex={-1}
                autoComplete="off"
              />

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl text-sm transition"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-2/3 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition shadow-md shadow-amber-200"
                >
                  {loading ? 'Submitting...' : 'Submit Solar Enquiry ✓'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

