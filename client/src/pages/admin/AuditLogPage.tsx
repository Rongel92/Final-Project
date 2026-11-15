import { useState } from 'react';
import { useApi } from '../../lib/useApi';
import type { AuditLog } from '../../lib/types';
import { displayName } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { SortHeader } from '../../components/SortHeader';
import { formatDateTime } from '../../lib/constants';

interface AuditList {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditLog[];
}

type LogTab = 'admin' | 'user';
const LOG_TABS: { key: LogTab; label: string }[] = [
  { key: 'admin', label: 'Administrative logs' },
  { key: 'user', label: 'User logs' },
];

export function AuditLogPage() {
  const [tab, setTab] = useState<LogTab>('admin');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'timestamp', dir: 'desc' });

  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('pageSize', String(pageSize));
  query.set('sort', sort.key);
  query.set('dir', sort.dir);
  query.set('roleGroup', tab);
  if (search.trim()) query.set('search', search.trim());

  const { data, loading, error } = useApi<AuditList>(
    `/audit-logs?${query.toString()}`,
    [tab, page, pageSize, sort.key, sort.dir, search]
  );

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every administrative and system action is recorded here." />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/60 w-fit">
        {LOG_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
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
      <div className="mb-4">
        <input
          className="input max-w-md"
          placeholder="Search action, entity, actor or resale…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {loading ? (
        <Spinner label="Loading audit log…" />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title={search ? 'No matching audit entries' : 'No audit entries'}
          hint={search ? 'Try a different search term.' : undefined}
        />
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <SortHeader label="Timestamp" sortKey="timestamp" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Action" sortKey="action" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Entity" sortKey="entity" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Actor" sortKey="actor" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.rows.map((a) => (
                    <tr key={a.id}>
                      <td className="td whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                      <td className="td font-medium">{a.action.replaceAll('_', ' ')}</td>
                      <td className="td">{a.entityType}</td>
                      <td className="td">{displayName(a.user) || a.role || 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span>
              {data.total} entries · page {data.page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                Per page
                <select
                  className="input h-8 w-20 py-0"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={75}>75</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
