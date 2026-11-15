import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApi } from '../../lib/useApi';
import type { HandoverRecord } from '../../lib/types';
import { displayName } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { SortHeader, useClientSort } from '../../components/SortHeader';
import { formatDateTime } from '../../lib/constants';

type HandoverTab = 'pending' | 'history';

const HANDOVER_TABS: { key: HandoverTab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'history', label: 'History' },
];

function statusText(h: HandoverRecord): string {
  if (h.completedAt) return 'Done';
  if (h.declinedAt) return 'Declined';
  if (h.claimedAt) return 'Accepted';
  return 'Pending';
}

export function HandoverManagementPage() {
  const { data, loading, error } = useApi<HandoverRecord[]>('/handovers');  // When returning from a signed form we restore the tab and search we left from.
  const restore = useLocation().state as { restoreTab?: HandoverTab; restoreSearch?: string } | null;
  const restoredTab = restore?.restoreTab ?? 'pending';
  const [tab, setTab] = useState<HandoverTab>(restoredTab);
  // Each tab keeps its own search term.
  const [pendingSearch, setPendingSearch] = useState(restoredTab === 'pending' ? restore?.restoreSearch ?? '' : '');
  const [historySearch, setHistorySearch] = useState(restoredTab === 'history' ? restore?.restoreSearch ?? '' : '');
  const search = tab === 'pending' ? pendingSearch : historySearch;
  const setSearch = tab === 'pending' ? setPendingSearch : setHistorySearch;
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'declined' | 'done'>('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [reasonModal, setReasonModal] = useState<{ name: string; reason: string } | null>(null);
  const records = data ?? [];
  useEffect(() => {
    setPage(1);
  }, [tab, search, statusFilter, modelFilter]);

  // Reset filters that don't apply when switching tabs.
  useEffect(() => {
    setStatusFilter('all');
  }, [tab]);

  const filtered = records.filter((h) => {
    const done = !!h.completedAt || !!h.declinedAt;
    return tab === 'history' ? done : !done;
  });

  const modelOptions = Array.from(
    new Set(
      filtered
        .map((h) => `${h.laptopModel?.manufacturer ?? ''} ${h.laptopModel?.modelName ?? ''}`.trim())
        .filter(Boolean)
    )
  ).sort();

  const statusMatches = (h: HandoverRecord) => {
    if (statusFilter === 'all') return true;
    return statusText(h).toLowerCase() === statusFilter;
  };
  const modelMatches = (h: HandoverRecord) =>
    modelFilter === 'all' ||
    `${h.laptopModel?.manufacturer ?? ''} ${h.laptopModel?.modelName ?? ''}`.trim() === modelFilter;

  const searchLower = search.trim().toLowerCase();
  const searched = filtered
    .filter(statusMatches)
    .filter(modelMatches)
    .filter((h) =>
      !searchLower
        ? true
        : [
            displayName(h.user),
            h.resale?.title,
            `${h.laptopModel?.manufacturer ?? ''} ${h.laptopModel?.modelName ?? ''}`,
            h.serialNumber,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(searchLower)
    );

  const { sorted, sort, toggleSort } = useClientSort(
    searched,
    {
      employee: (h) => displayName(h.user),
      resale: (h) => h.resale?.title,
      model: (h) => `${h.laptopModel?.manufacturer ?? ''} ${h.laptopModel?.modelName ?? ''}`.trim(),
      serial: (h) => h.serialNumber,
      signedBy: (h) => displayName(h.administrator),
      status: (h) => statusText(h),
    },
    { key: 'employee', dir: 'asc' }
  );

  const PAGE_SIZE = 25;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) return <Spinner label="Loading handovers…" />;
  if (error) return <ErrorBanner message={error} />;

  const statusBadge = (h: HandoverRecord) => {
    if (h.completedAt) return <span className="badge bg-emerald-100 text-emerald-800">Done</span>;
    if (h.declinedAt) return <span className="badge bg-rose-100 text-rose-700">Declined</span>;
    if (h.claimedAt)
      return <span className="badge bg-amber-100 text-amber-800">Accepted</span>;
    return <span className="badge bg-slate-100 text-slate-600">Pending</span>;
  };

  return (
    <div>
      <PageHeader title="Handovers" subtitle="Manage laptop acceptances and confirmations." />
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/60 w-fit">
        {HANDOVER_TABS.map((t) => (
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <input
            className="input w-full pr-9"
            placeholder="Search by employee, resale, model or serial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
        <select
          className="input w-auto"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {tab === 'pending' ? (
            <>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
            </>
          ) : (
            <>
              <option value="done">Done</option>
              <option value="declined">Declined</option>
            </>
          )}
        </select>
        <select
          className="input w-auto"
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          aria-label="Filter by model"
        >
          <option value="all">All models</option>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {(statusFilter !== 'all' || modelFilter !== 'all') && (
          <button
            type="button"
            className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            onClick={() => {
              setStatusFilter('all');
              setModelFilter('all');
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <EmptyState
          title={
            searchLower || statusFilter !== 'all' || modelFilter !== 'all'
              ? 'No matching handovers'
              : tab === 'pending'
                ? 'No pending handovers'
                : 'No past handovers'
          }
          hint={
            tab === 'pending' && !searchLower && statusFilter === 'all' && modelFilter === 'all'
              ? 'Handovers appear here once results are published and winners begin accepting their selection.'
              : undefined
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <SortHeader label="Employee" sortKey="employee" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Resale" sortKey="resale" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Model" sortKey="model" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Serial" sortKey="serial" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Signed by" sortKey="signedBy" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((h) => (
                  <tr key={h.id}>
                    <td className="td font-medium">{displayName(h.user)}</td>
                    <td className="td">{h.resale?.title}</td>
                    <td className="td">
                      {h.laptopModel?.manufacturer} {h.laptopModel?.modelName}
                    </td>
                    <td className="td font-mono text-xs">{h.serialNumber ?? '—'}</td>
                    <td className="td">{displayName(h.administrator) || '—'}</td>
                    <td className="td">{statusBadge(h)}</td>
                    <td className="td whitespace-nowrap pl-0 text-right">
                      {h.completedAt ? (
                        <Link
                          to={`/pickup/${h.registrationId}`}
                          state={{ from: { tab, search } }}
                          className="btn-primary px-4 py-1.5 text-sm"
                        >
                          View form
                        </Link>
                      ) : h.declinedAt ? (
                        <span className="group relative inline-block">
                          <button
                            type="button"
                            onClick={() =>
                              setReasonModal({
                                name: displayName(h.user),
                                reason: h.declineReason || 'No reason was provided.',
                              })
                            }
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/40"
                          >
                            View reason
                          </button>
                          <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-max max-w-64 whitespace-pre-wrap rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal text-white shadow-lg group-hover:block dark:bg-slate-700">
                            {h.declineReason || 'No reason was provided.'}
                          </span>
                        </span>
                      ) : (
                        <Link
                          to={`/pickup/${h.registrationId}`}
                          state={{ from: { tab, search } }}
                          className="btn-primary px-4 py-1.5 text-sm"
                        >
                          Sign handover
                        </Link>
                      )}
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
      {tab === 'history' && records.some((r) => r.completedAt) && (
        <p className="mt-3 text-xs text-slate-400">
          Last completed: {formatDateTime(records.find((r) => r.completedAt)?.completedAt)}
        </p>
      )}
      {reasonModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setReasonModal(null)}
        >
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Decline reason — {reasonModal.name}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
              {reasonModal.reason}
            </p>
            <div className="mt-6 flex justify-end">
              <button className="btn-secondary" onClick={() => setReasonModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
