import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';
import type { Registration } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, RegStatusBadge, Spinner } from '../../components/ui';
import { SortHeader, useClientSort } from '../../components/SortHeader';
import { formatDate } from '../../lib/constants';

export function MyRegistrationsPage() {
  const { data, loading, error } = useApi<Registration[]>('/registrations/mine');
  const regs = data ?? [];
  const { sorted, sort, toggleSort } = useClientSort(
    regs,
    {
      resale: (r) => r.resale?.title,
      registered: (r) => r.submittedAt ?? r.createdAt,
      status: (r) => r.status,
    },
    { key: 'registered', dir: 'desc' }
  );
  if (loading) return <Spinner label="Loading your registrations…" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <PageHeader title="My Registrations" subtitle="All resales you have registered for." />
      {regs.length === 0 ? (
        <EmptyState title="You have not registered for any resales yet" hint="Browse active resales to get started." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <SortHeader label="Resale" sortKey="resale" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Registered" sortKey="registered" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td className="td font-medium">{r.resale?.title}</td>
                    <td className="td">{formatDate(r.submittedAt ?? r.createdAt)}</td>
                    <td className="td"><RegStatusBadge status={r.status} /></td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-2">
                        {r.status === 'WINNER' && (
                          <Link to={`/pickup/${r.id}`} className="text-sm font-medium text-emerald-600">
                            Accept
                          </Link>
                        )}
                        <Link to={`/registrations/${r.id}`} className="text-sm font-medium text-brand-600">
                          Details
                        </Link>
                      </div>
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
