import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi';
import type { AdminStats, Resale, HandoverRecord, LaptopModel } from '../../lib/types';
import { displayName } from '../../lib/types';
import { ErrorBanner, PageHeader, Spinner, StatusBadge } from '../../components/ui';
import { currency, formatDate, formatDateTime } from '../../lib/constants';

interface InventoryUnit {
  id: string;
  status: string;
  laptopModel: LaptopModel;
}

function handoverBadge(h: HandoverRecord) {
  if (h.employeeConfirmation && !h.administratorConfirmation)
    return { label: 'Pending admin', className: 'bg-amber-100 text-amber-800' };
  return { label: 'Pending user', className: 'bg-slate-100 text-slate-600' };
}

function modelLabel(m: LaptopModel): string {
  return `${m.manufacturer ?? ''} ${m.modelName}`.trim();
}

// The most relevant upcoming milestone for a resale, depending on its phase.
function resaleTimeline(l: Resale): { label: string; date?: string | null; withTime?: boolean } {
  if (l.status === 'OPEN' || l.status === 'SCHEDULED') {
    const closed = new Date(l.registrationCloseAt) <= new Date();
    return {
      label: closed ? 'Registration closed' : 'Registration closes',
      date: l.registrationCloseAt,
    };
  }
  if (l.status === 'CLOSED') {
    return { label: 'Expected resale', date: l.resaleAt, withTime: true };
  }
  // SELECTING / RESULTS_PENDING / RESULTS_PUBLISHED / PICKUP — winners are being
  // handed their laptops; the resale stays open until an admin closes it.
  return { label: 'Awaiting handovers', date: null };
}

export function AdminDashboard() {
  const { data, loading, error } = useApi<AdminStats>('/stats/admin', [], 10000);
  const handoversQ = useApi<HandoverRecord[]>('/handovers', [], 10000);
  const inventoryQ = useApi<InventoryUnit[]>('/inventory', [], 10000);

  const activeHandovers = useMemo(
    () => (handoversQ.data ?? []).filter((h) => !h.completedAt && !h.declinedAt),
    [handoversQ.data]
  );

  const activeResales = useMemo(
    () =>
      (data?.resaleStatuses ?? []).filter(
        (l) => !['DRAFT', 'COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(l.status)
      ),
    [data?.resaleStatuses]
  );

  const inventoryGroups = useMemo(() => {
    const units = inventoryQ.data ?? [];
    const map = new Map<string, { model: LaptopModel; available: number }>();
    for (const u of units) {
      if (u.status === 'REMOVED' || u.status === 'RETURNED' || u.status === 'HANDED_OVER') continue;
      let g = map.get(u.laptopModel.id);
      if (!g) {
        g = { model: u.laptopModel, available: 0 };
        map.set(u.laptopModel.id, g);
      }
      if (u.status === 'AVAILABLE') g.available += 1;
    }
    return Array.from(map.values()).sort((a, b) =>
      modelLabel(a.model).localeCompare(modelLabel(b.model))
    );
  }, [inventoryQ.data]);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Administration Dashboard"
        subtitle="Overview of resales, registrations and operations."
        actions={
          <Link to="/admin/resales/new" className="btn-primary">
            Create resale
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Resale status</h2>
            <Link to="/admin/resales" className="text-sm font-medium text-brand-600 hover:underline">
              All resales
            </Link>
          </div>
          {activeResales.length === 0 ? (
            <p className="text-sm text-slate-400">No active resales.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeResales.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link
                      to={`/admin/resales/${l.id}`}
                      className="block truncate font-medium text-brand-600 hover:underline"
                    >
                      {l.title}
                    </Link>
                    <p className="text-xs text-slate-400">
                      {(() => {
                        const t = resaleTimeline(l);
                        const shown = t.date
                          ? t.withTime
                            ? formatDateTime(t.date)
                            : formatDate(t.date)
                          : '—';
                        return `${t.label} ${shown}`;
                      })()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={l.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Active handovers</h2>
            <Link to="/admin/handovers" className="text-sm font-medium text-brand-600 hover:underline">
              All handovers
            </Link>
          </div>
          {handoversQ.loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : activeHandovers.length === 0 ? (
            <p className="text-sm text-slate-400">No handovers in progress.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeHandovers.map((h) => {
                const badge = handoverBadge(h);
                return (
                  <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{displayName(h.user)}</p>
                      <p className="truncate text-xs text-slate-400">
                        {h.laptopModel ? modelLabel(h.laptopModel) : h.resale?.title}
                        {h.serialNumber ? ` · ${h.serialNumber}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                      <Link to={`/pickup/${h.registrationId}`} className="btn-secondary px-3 py-1 text-xs">
                        Manage
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-6">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Inventory</h2>
            <Link to="/admin/inventory" className="text-sm font-medium text-brand-600 hover:underline">
              Manage inventory
            </Link>
          </div>
          {inventoryQ.loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : inventoryGroups.length === 0 ? (
            <p className="text-sm text-slate-400">No inventory in stock.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {inventoryGroups.map((g) => (
                <li key={g.model.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{modelLabel(g.model)}</p>
                    <p className="text-xs text-slate-400">
                      {typeof g.model.price === 'number' ? currency(g.model.price, g.model.currency) : '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="badge bg-emerald-100 text-emerald-800">{g.available} available</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
