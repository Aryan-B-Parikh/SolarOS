'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, X, AlertCircle, KeyRound, ShieldCheck, Copy, Check,
} from 'lucide-react';
import clsx from 'clsx';
import { apiPatch, apiPost } from '@/lib/client-api';
import { formatDateTimeIST } from '@/lib/dates';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES = ['DIRECTOR', 'SALES', 'TECHNICIAN', 'WAREHOUSE', 'SUPPORT', 'ACCOUNTS'] as const;

const ROLE_BADGE: Record<string, string> = {
  DIRECTOR: 'bg-purple-100 text-purple-800',
  SALES: 'bg-blue-100 text-blue-800',
  TECHNICIAN: 'bg-emerald-100 text-emerald-800',
  WAREHOUSE: 'bg-amber-100 text-amber-800',
  SUPPORT: 'bg-sky-100 text-sky-800',
  ACCOUNTS: 'bg-indigo-100 text-indigo-800',
};

/** Generates a readable 12-char password: guaranteed upper, lower, digit, symbol. */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!?';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 12) chars.push(pick(all));
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export default function UsersClient({
  currentUserId,
  initialUsers,
}: {
  currentUserId: string;
  initialUsers: UserRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add-user modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<(typeof ROLES)[number]>('SUPPORT');
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [creating, setCreating] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset password state
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState(generatePassword());
  const [resetting, setResetting] = useState(false);

  const handleToggleActive = async (u: UserRow) => {
    setBusyId(u.id);
    setError(null);
    try {
      await apiPatch(`/api/v1/admin/users/${u.id}`, { isActive: !u.isActive });
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to update user');
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = async (u: UserRow, role: string) => {
    setBusyId(u.id);
    setError(null);
    try {
      await apiPatch(`/api/v1/admin/users/${u.id}`, { role });
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to change role');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiPost('/api/v1/admin/users', {
        name: newName,
        email: newEmail,
        phone: newPhone || undefined,
        role: newRole,
        password: newPassword,
      });
      setCreatedPassword({ name: newName, password: newPassword });
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewRole('SUPPORT');
      setNewPassword(generatePassword());
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    setResetting(true);
    setError(null);
    try {
      await apiPatch(`/api/v1/admin/users/${resetFor.id}`, { password: resetPassword });
      setCreatedPassword({ name: resetFor.name, password: resetPassword });
      setResetFor(null);
      setResetPassword(generatePassword());
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const copyPassword = async () => {
    if (!createdPassword) return;
    try {
      await navigator.clipboard.writeText(createdPassword.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the password is displayed in plain text anyway
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {initialUsers.length} staff accounts • deactivation preserves history (no deletion)
        </p>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" /> Add user
        </button>
      </div>

      {/* Users table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Last Login (IST)</th>
              <th className="px-4 py-2.5">Active</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {initialUsers.map((u) => (
              <tr key={u.id} className={clsx('hover:bg-slate-50', !u.isActive && 'opacity-60')}>
                <td className="px-4 py-2.5 font-semibold text-slate-900">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="ml-1.5 text-[10px] font-bold text-blue-700">(you)</span>
                  )}
                </td>
                <td className="px-4 py-2.5">{u.email}</td>
                <td className="px-4 py-2.5 font-mono text-[11px]">{u.phone || '—'}</td>
                <td className="px-4 py-2.5">
                  {u.id === currentUserId ? (
                    <span className={clsx('px-2 py-0.5 rounded text-[10px] font-bold', ROLE_BADGE[u.role])}>
                      {u.role}
                    </span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value)}
                      disabled={busyId === u.id}
                      className={clsx(
                        'px-2 py-1 rounded text-[10px] font-bold border-0 cursor-pointer focus:ring-2 focus:ring-blue-500',
                        ROLE_BADGE[u.role]
                      )}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-500">
                  {u.lastLoginAt ? formatDateTimeIST(u.lastLoginAt) : 'Never'}
                </td>
                <td className="px-4 py-2.5">
                  {/* Toggle switch */}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(u)}
                    disabled={busyId === u.id || u.id === currentUserId}
                    title={
                      u.id === currentUserId
                        ? 'You cannot deactivate your own account'
                        : u.isActive
                        ? 'Deactivate (history preserved)'
                        : 'Reactivate account'
                    }
                    className={clsx(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                      u.isActive ? 'bg-emerald-500' : 'bg-slate-300',
                      (busyId === u.id || u.id === currentUserId) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span
                      className={clsx(
                        'inline-block w-3.5 h-3.5 transform rounded-full bg-white transition-transform',
                        u.isActive ? 'translate-x-[18px]' : 'translate-x-[3px]'
                      )}
                    />
                  </button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setResetFor(u);
                      setResetPassword(generatePassword());
                    }}
                    className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-semibold inline-flex items-center gap-1"
                  >
                    <KeyRound className="w-3 h-3" /> Reset password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL: Add user */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" /> Add Staff User
              </h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">Full name</label>
                <input
                  required
                  minLength={2}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Meera Desai"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">Email</label>
                <input
                  required
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="name@sunpower.ops"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600">
                    Phone <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="+919825000010"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 text-xs border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  Generated password <span className="text-slate-400 font-normal">(shown once after creation)</span>
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 text-xs bg-slate-900 text-amber-300 rounded-lg font-mono">
                    {newPassword}
                  </code>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generatePassword())}
                    className="px-2.5 py-2 rounded-lg border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-3.5 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? 'Creating…' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reset password */}
      {resetFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" /> Reset password — {resetFor.name}
              </h3>
              <button type="button" onClick={() => setResetFor(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600">
                  New generated password
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 text-xs bg-slate-900 text-amber-300 rounded-lg font-mono">
                    {resetPassword}
                  </code>
                  <button
                    type="button"
                    onClick={() => setResetPassword(generatePassword())}
                    className="px-2.5 py-2 rounded-lg border border-slate-300 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Regenerate
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResetFor(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="px-3.5 py-1.5 text-xs bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {resetting ? 'Resetting…' : 'Reset password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: password display after create/reset */}
      {createdPassword && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Password for {createdPassword.name}
            </h3>
            <p className="text-xs text-slate-500">
              Copy this password now and share it with the user over a secure channel. It is displayed
              only once and never stored in plain text.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2.5 text-sm bg-slate-900 text-amber-300 rounded-lg font-mono break-all">
                {createdPassword.password}
              </code>
              <button
                type="button"
                onClick={copyPassword}
                className="px-2.5 py-2.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCreatedPassword(null)}
                className="px-3.5 py-1.5 text-xs bg-slate-800 text-white font-semibold rounded-lg hover:bg-slate-900"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
