import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import type { ParticipationHistory } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { SortHeader, useClientSort } from '../../components/SortHeader';
import { formatDate } from '../../lib/constants';

export function ParticipationHistoryPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<ParticipationHistory[]>(
    user ? `/users/${user.id}/participation` : null
  );

  const history = data ?? [];
  const { sorted, sort, toggleSort } = useClientSort(
    history,
    {
      resale: (p) => p.resale?.title,
      date: (p) => p.participationDate,
      outcome: (p) => p.winner,
      purchased: (p) => p.purchaseCompleted,
      next: (p) => p.nextEligibleAt,
    },
    { key: 'date', dir: 'desc' }
  );

  if (loading) return <Spinner label="Loading participation history…" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <PageHeader title="Participation History" subtitle="Your previous resale participation and purchases." />
      {history.length === 0 ? (
        <EmptyState title="No participation history yet" hint="Your entries will appear here after you register for a resale." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <SortHeader label="Resale" sortKey="resale" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Date" sortKey="date" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Outcome" sortKey="outcome" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Purchased" sortKey="purchased" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Next eligible" sortKey="next" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map((p) => (
                  <tr key={p.id}>
                    <td className="td font-medium">{p.resale?.title}</td>
                    <td className="td">{formatDate(p.participationDate)}</td>
                    <td className="td">
                      {p.winner ? (
                        <span className="badge bg-emerald-100 text-emerald-800">Selected</span>
                      ) : (
                        <span className="badge bg-slate-100 text-slate-600">Not selected</span>
                      )}
                    </td>
                    <td className="td">{p.purchaseCompleted ? 'Yes' : 'No'}</td>
                    <td className="td">{formatDate(p.nextEligibleAt)}</td>
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
