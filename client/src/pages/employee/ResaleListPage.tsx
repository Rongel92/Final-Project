import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';
import type { Resale } from '../../lib/types';
import { EmptyState, PageHeader, RegStatusBadge, Spinner, StatusBadge, ErrorBanner } from '../../components/ui';
import { formatDate, timeRemaining } from '../../lib/constants';

export function ResaleListPage() {
  const { data, loading, error } = useApi<Resale[]>('/resales');

  if (loading) return <Spinner label="Loading resales…" />;
  if (error) return <ErrorBanner message={error} />;

  const resales = data ?? [];

  return (
    <div>
      <PageHeader title="Laptop Resales" subtitle="Active and upcoming resales available to you." />
      {resales.length === 0 ? (
        <EmptyState title="No resales available" hint="There are no published resales at the moment." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {resales.map((l) => {
            const myStatus = (l.myRegistration as any)?.status as string | undefined;
            return (
              <div key={l.id} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">{l.title}</h3>
                  <StatusBadge status={l.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500 line-clamp-2">{l.description}</p>

                <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-slate-400">Opens</dt>
                  <dd className="text-right">{formatDate(l.registrationOpenAt)}</dd>
                  <dt className="text-slate-400">Closes</dt>
                  <dd className="text-right">{formatDate(l.registrationCloseAt)}</dd>
                  <dt className="text-slate-400">Models</dt>
                  <dd className="text-right">{l.modelCount ?? l.models?.length ?? 0}</dd>
                  <dt className="text-slate-400">Total laptops</dt>
                  <dd className="text-right">{l.totalLaptops ?? 0}</dd>
                </dl>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-600">
                    {l.status === 'OPEN' ? timeRemaining(l.registrationCloseAt) : ''}
                  </span>
                  {myStatus && <RegStatusBadge status={myStatus} />}
                </div>

                <Link to={`/resales/${l.id}`} className="btn-primary mt-4">
                  View details
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
