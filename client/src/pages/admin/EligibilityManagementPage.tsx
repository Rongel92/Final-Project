import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { User } from '../../lib/types';
import { displayName } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { SortHeader, useClientSort } from '../../components/SortHeader';
import { useToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';

type Override = Pick<
  User,
  'id' | 'fullName' | 'email' | 'department' | 'manualEligibility' | 'eligibilityNote'
>;

export function EligibilityManagementPage() {
  const toast = useToast();
  const { data: overrides, loading, error, refetch } = useApi<Override[]>('/eligibility/admin/overrides');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState<Override | null>(null);

  const list = overrides ?? [];

  const { sorted, sort, toggleSort } = useClientSort(
    list,
    {
      name: (u) => displayName(u),
      email: (u) => u.email,
      status: (u) => u.manualEligibility,
    },
    { key: 'name', dir: 'asc' }
  );

  const setOverride = async (status: 'ELIGIBLE' | 'INELIGIBLE') => {
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    try {
      await api.post('/eligibility/admin/overrides', {
        email: value,
        status,
        note: note.trim() || undefined,
      });
      toast.success(
        status === 'ELIGIBLE'
          ? 'User marked as eligible.'
          : 'User marked as not eligible.'
      );
      setEmail('');
      setNote('');
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update eligibility.');
    } finally {
      setBusy(false);
    }
  };

  const clearOverride = async (u: Override) => {
    setBusy(true);
    try {
      await api.post('/eligibility/admin/overrides', { email: u.email, status: null });
      toast.success('Override cleared — eligibility is automatic again.');
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to clear override.');
    } finally {
      setBusy(false);
      setConfirmClear(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Eligibility"
        subtitle="Manually mark specific users as eligible or not eligible, overriding the automatic cooldown rules."
      />

      {loading ? (
        <Spinner label="Loading eligibility overrides…" />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 text-base font-semibold">Set an eligibility override</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                className="input max-w-md"
                placeholder="Enter the user's email address…"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="text"
                className="input max-w-xs"
                placeholder="Reason (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                className="btn-success"
                disabled={busy || !email.trim()}
                onClick={() => setOverride('ELIGIBLE')}
              >
                Mark eligible
              </button>
              <button
                className="btn-danger"
                disabled={busy || !email.trim()}
                onClick={() => setOverride('INELIGIBLE')}
              >
                Mark not eligible
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              The user must already have an account. A manual override always takes precedence over
              the automatic cooldown. Clear it to return the user to automatic evaluation.
            </p>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 p-5 dark:border-slate-800">
              <h2 className="text-base font-semibold">Active overrides ({list.length})</h2>
            </div>
            {list.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No manual overrides" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <SortHeader label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                      <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                      <th className="th">Reason</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sorted.map((u) => (
                      <tr key={u.id}>
                        <td className="td font-medium">{displayName(u)}</td>
                        <td className="td">{u.email}</td>
                        <td className="td">
                          {u.manualEligibility === 'ELIGIBLE' ? (
                            <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              Eligible
                            </span>
                          ) : (
                            <span className="badge bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                              Not eligible
                            </span>
                          )}
                        </td>
                        <td className="td text-slate-500">{u.eligibilityNote ?? '—'}</td>
                        <td className="td text-right">
                          <button
                            className="text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 dark:hover:text-slate-300"
                            disabled={busy}
                            onClick={() => setConfirmClear(u)}
                          >
                            Clear
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          open
          title="Clear eligibility override"
          message={`Remove the manual eligibility override for ${displayName(confirmClear)}? Their eligibility will be evaluated automatically again.`}
          confirmLabel="Clear override"
          onConfirm={() => clearOverride(confirmClear)}
          onCancel={() => setConfirmClear(null)}
        />
      )}
    </div>
  );
}
