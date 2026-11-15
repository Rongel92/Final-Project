import { useNavigate } from 'react-router-dom';
import { useApi } from '../../lib/useApi';
import type { ParticipatedResale } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { SortHeader, useClientSort } from '../../components/SortHeader';
import { formatDate } from '../../lib/constants';

// Employee-facing outcome shown instead of the internal registration status.
function outcome(p: ParticipatedResale): { label: string; cls: string } {
  if (p.declined) return { label: 'Declined', cls: 'bg-rose-100 text-rose-800' };
  switch (p.status) {
    case 'WINNER':
      return { label: 'Won', cls: 'bg-emerald-100 text-emerald-800' };
    case 'COMPLETED':
      return { label: 'Received', cls: 'bg-emerald-100 text-emerald-800' };
    case 'DECLINED':
      return { label: 'Declined', cls: 'bg-rose-100 text-rose-800' };
    case 'WAITING_LIST':
      return { label: 'Waiting list', cls: 'bg-amber-100 text-amber-800' };
    case 'NOT_SELECTED':
    case 'EXCLUDED':
      return { label: 'Not won', cls: 'bg-slate-100 text-slate-600' };
    case 'CANCELLED':
      return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-600' };
    case 'SUBMITTED':
    case 'PENDING':
      return { label: 'Registered', cls: 'bg-blue-100 text-blue-800' };
    default:
      return { label: p.status, cls: 'bg-slate-100 text-slate-600' };
  }
}

export function ParticipatedResalesPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useApi<ParticipatedResale[]>('/registrations/mine/participated');

  const items = data ?? [];
  const { sorted, sort, toggleSort } = useClientSort(
    items,
    {
      resale: (p) => p.resaleTitle,
      date: (p) => p.date,
      status: (p) => outcome(p).label,
    },
    { key: 'date', dir: 'desc' }
  );

  if (loading) return <Spinner label="Loading your resales…" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <PageHeader
          title="Participated Resales"
          subtitle="Every resale you registered for, with the outcome."
        />
        <button className="btn-secondary shrink-0" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="You haven't participated in any resales yet"
          hint="Once you register for a resale it will appear here."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <SortHeader label="Resale" sortKey="resale" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Date" sortKey="date" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map((p) => (
                  <tr key={p.registrationId} className="align-top">
                    <td className="td font-medium">{p.resaleTitle}</td>
                    <td className="td whitespace-nowrap">{formatDate(p.date)}</td>
                    <td className="td">
                      {(() => {
                        const o = outcome(p);
                        return <span className={`badge ${o.cls}`}>{o.label}</span>;
                      })()}
                      {p.declined && (
                        <div className="mt-2 max-w-md space-y-1 rounded-lg border border-rose-200 bg-rose-50/60 p-3 text-xs dark:border-rose-900/50 dark:bg-rose-900/20">
                          <p>
                            <span className="font-semibold text-rose-600 dark:text-rose-300">
                              Stage:
                            </span>{' '}
                            <span className="text-slate-700 dark:text-slate-200">
                              {p.declined.stage}
                            </span>
                          </p>
                          <p>
                            <span className="font-semibold text-rose-600 dark:text-rose-300">
                              Reason:
                            </span>{' '}
                            <span className="text-slate-700 dark:text-slate-200">
                              {p.declined.reason || 'No reason was provided.'}
                            </span>
                          </p>
                          <p>
                            <span className="font-semibold text-rose-600 dark:text-rose-300">
                              By:
                            </span>{' '}
                            <span className="text-slate-700 dark:text-slate-200">
                              {p.declined.byName || '—'}
                            </span>
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
