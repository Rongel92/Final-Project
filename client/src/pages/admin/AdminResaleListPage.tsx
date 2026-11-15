import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Resale } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusBadge } from '../../components/ui';
import { SortHeader, useClientSort } from '../../components/SortHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { formatDate } from '../../lib/constants';

const ONGOING_STATUSES = [
  'SCHEDULED',
  'OPEN',
  'CLOSED',
  'SELECTING',
  'RESULTS_PENDING',
  'RESULTS_PUBLISHED',
  'PICKUP',
];

type ResaleTab = 'ongoing' | 'drafts' | 'history';

const RESALE_TABS: { key: ResaleTab; label: string }[] = [
  { key: 'ongoing', label: 'On Going' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'history', label: 'History' },
];

export function AdminResaleListPage() {
  const { data, loading, error, refetch } = useApi<Resale[]>('/resales');
  const toast = useToast();
  const [tab, setTab] = useState<ResaleTab>('ongoing');
  const [confirmDelete, setConfirmDelete] = useState<Resale | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const resales = data ?? [];

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.del(`/resales/${confirmDelete.id}`);
      toast.success('Draft deleted.');
      setConfirmDelete(null);
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = resales.filter((l) => {
    if (tab === 'ongoing') return ONGOING_STATUSES.includes(l.status);
    if (tab === 'drafts') return l.status === 'DRAFT';
    return l.status === 'CANCELLED' || l.status === 'COMPLETED';
  });

  const searchLower = search.trim().toLowerCase();
  const searched =
    tab === 'history' && searchLower
      ? filtered.filter((l) => l.title.toLowerCase().includes(searchLower))
      : filtered;

  const { sorted, sort, toggleSort } = useClientSort(
    searched,
    {
      title: (l) => l.title,
      status: (l) => l.status,
      closes: (l) => l.registrationCloseAt,
      models: (l) => l.modelCount ?? l.models?.length ?? 0,
      registrations: (l) => l._count?.registrations ?? 0,
    },
    { key: 'closes', dir: 'desc' }
  );

  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) return <Spinner label="Loading resales…" />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div>
      <PageHeader
        title="Resales"
        subtitle="Create and manage all laptop resales."
        actions={
          <Link to="/admin/resales/new" className="btn-primary">
            Create resale
          </Link>
        }
      />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/60 w-fit">
        {RESALE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'history' && (
        <div className="mb-4">
          <input
            className="input max-w-xs"
            placeholder="Search by resale number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {sorted.length === 0 ? (
        <EmptyState
          title={
            tab === 'ongoing'
              ? 'No on going resales'
              : tab === 'drafts'
                ? 'No draft resales'
                : searchLower
                  ? 'No matching resales'
                  : 'No past resales'
          }
          hint={tab === 'drafts' ? 'Create a resale to get started.' : undefined}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <SortHeader label="Number" sortKey="title" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Closes" sortKey="closes" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Models" sortKey="models" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Registrations" sortKey="registrations" sort={sort} onSort={toggleSort} />
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((l) => (
                  <tr key={l.id}>
                    <td className="td font-medium">{l.title}</td>
                    <td className="td"><StatusBadge status={l.status} /></td>
                    <td className="td">{formatDate(l.registrationCloseAt)}</td>
                    <td className="td">{l.modelCount ?? l.models?.length ?? 0}</td>
                    <td className="td">{l._count?.registrations ?? 0}</td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-4">
                        {l.status === 'DRAFT' && (
                          <button
                            className="text-sm font-medium text-rose-600 hover:text-rose-700"
                            onClick={() => setConfirmDelete(l)}
                          >
                            Delete draft
                          </button>
                        )}
                        <Link to={`/admin/resales/${l.id}`} className="text-sm font-medium text-brand-600">
                          Manage
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">
                {sorted.length} total · Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <button
                  className="btn-secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open
          title="Delete draft"
          message={`This permanently deletes "${confirmDelete.title}" and every registration, result, form and handover tied to it. This cannot be undone.`}
          confirmLabel={deleting ? 'Deleting…' : 'Delete permanently'}
          onConfirm={doDelete}
          onCancel={() => (deleting ? undefined : setConfirmDelete(null))}
        />
      )}
    </div>
  );
}
