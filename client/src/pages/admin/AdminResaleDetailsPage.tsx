import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type {
  LaptopModel,
  Resale,
  ResaleResult,
  PreResaleStats,
  Registration,
  HandoverRecord,
} from '../../lib/types';
import { displayName } from '../../lib/types';
import {
  EligibilityBadge,
  EmptyState,
  ErrorBanner,
  Field,
  PageHeader,
  RegStatusBadge,
  Spinner,
  StatusBadge,
} from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ComposeEmailButton } from '../../components/ComposeEmailButton';
import { ResaleWizardSteps } from '../../components/ResaleWizardSteps';
import { useToast } from '../../components/Toast';
import { currency, formatDate, formatDateTime } from '../../lib/constants';

interface InventoryUnit {
  id: string;
  status: string;
  laptopModel: LaptopModel;
}

export function AdminResaleDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const resaleQ = useApi<Resale>(`/resales/${id}`);
  const catalogQ = useApi<LaptopModel[]>('/laptop-models');
  const inventoryQ = useApi<InventoryUnit[]>('/inventory');
  const resale = resaleQ.data;

  if (resaleQ.loading) return <Spinner label="Loading resale…" />;
  if (resaleQ.error) return <ErrorBanner message={resaleQ.error} />;
  if (!resale) return null;

  const refresh = () => {
    resaleQ.refetch();
    inventoryQ.refetch();
  };
  const status = resale.status;
  const canEditModels = ['DRAFT', 'SCHEDULED'].includes(status);
  const canRunResale = ['CLOSED'].includes(status);
  const hasResults = ['RESULTS_PENDING', 'RESULTS_PUBLISHED', 'PICKUP', 'COMPLETED'].includes(status);
  // While the resale is still a draft it is being built through the wizard, so the
  // page shows only the models step; the summary and lifecycle actions live on
  // the Review & publish step.
  const isDraftWizard = status === 'DRAFT';
  const hasModels = (resale.models ?? []).length > 0;

  const availableByModel: Record<string, number> = {};
  for (const u of inventoryQ.data ?? []) {
    if (u.status === 'AVAILABLE') {
      availableByModel[u.laptopModel.id] = (availableByModel[u.laptopModel.id] ?? 0) + 1;
    }
  }

  return (
    <div>
      <PageHeader
        title={resale.title}
        actions={<StatusBadge status={status} />}
      />

      {canEditModels && (
        <ResaleWizardSteps
          current="models"
          resaleId={resale.id}
          lockedSteps={isDraftWizard && !hasModels ? ['review'] : []}
        />
      )}

      <div className={isDraftWizard ? '' : 'grid grid-cols-1 gap-6 lg:grid-cols-3'}>
        <div className={isDraftWizard ? 'space-y-6' : 'space-y-6 lg:col-span-2'}>
          <ModelsSection
            resale={resale}
            catalog={catalogQ.data ?? []}
            availableByModel={availableByModel}
            editable={canEditModels}
            onChange={refresh}
          />
          {canRunResale && <ResaleSection resaleId={resale.id} onResaleRun={refresh} />}
          {isDraftWizard && (
            <div className="flex items-center justify-end gap-3">
              {!hasModels && (
                <span className="text-xs text-slate-400">
                  Add at least one laptop model to continue.
                </span>
              )}
              <button
                className="btn-primary"
                disabled={!hasModels}
                onClick={() => navigate(`/admin/resales/${resale.id}/review`)}
              >
                Next: Review &amp; publish
              </button>
            </div>
          )}
        </div>

        {!isDraftWizard && (
          <div className="space-y-6">
            <InfoCard resale={resale} />
            <TransitionsCard resale={resale} onChange={refresh} />
          </div>
        )}
      </div>

      {/* Full width: the registration table needs the room for ranked model lists. */}
      {!canEditModels && (
        <div className="mt-6">
          <ParticipantsPanel resale={resale} hasResults={hasResults} onChange={refresh} />
        </div>
      )}
    </div>
  );
}

interface RegList {
  total: number;
  page: number;
  pageSize: number;
  rows: Registration[];
}

type ParticipantsTab = 'registrations' | 'winners' | 'waiting';

// Single windowed panel that lets an admin switch between the registration list,
// the selected winners, and the ordered waiting list ("next in line").
function ParticipantsPanel({
  resale,
  hasResults,
  onChange,
}: {
  resale: Resale;
  hasResults: boolean;
  onChange: () => void;
}) {
  const [tab, setTab] = useState<ParticipantsTab>(hasResults ? 'winners' : 'registrations');
  const tabs: { key: ParticipantsTab; label: string }[] = [
    { key: 'registrations', label: 'Registrations' },
    ...(hasResults
      ? ([
          { key: 'winners', label: 'Winners' },
          { key: 'waiting', label: 'Next in line' },
        ] as { key: ParticipantsTab; label: string }[])
      : []),
  ];

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800/60 w-fit">
          {tabs.map((t) => (
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
      )}
      {tab === 'registrations' && <RegistrationsSection resale={resale} />}
      {(tab === 'winners' || tab === 'waiting') && (
        <ResultsSection resale={resale} onChange={onChange} view={tab} />
      )}
    </div>
  );
}

function RegistrationsSection({ resale }: { resale: Resale }) {
  const resaleId = resale.id;
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modelFilter, setModelFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (statusFilter !== 'all') query.set('status', statusFilter);
  if (modelFilter !== 'all') query.set('laptopModelId', modelFilter);
  query.set('resaleId', resaleId);
  query.set('sort', sort.key);
  query.set('dir', sort.dir);
  query.set('page', String(page));

  const { data, loading, error, refetch } = useApi<RegList>(
    `/registrations?${query.toString()}`,
    [search, statusFilter, modelFilter, page, resaleId, sort.key, sort.dir]
  );

  const modelOptions = (resale.models ?? [])
    .map((m) => ({
      id: m.laptopModelId,
      label: `${m.laptopModel.manufacturer} ${m.laptopModel.modelName}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const statusOptions = ['SUBMITTED', 'WINNER', 'WAITING_LIST', 'DECLINED', 'NOT_SELECTED', 'COMPLETED', 'EXCLUDED', 'CANCELLED'];
  const filtersActive = Boolean(search) || statusFilter !== 'all' || modelFilter !== 'all';

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const [action, setAction] = useState<{ reg: Registration; kind: 'exclude' | 'override' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submitAction = async () => {
    if (!action || reason.trim().length < 2) return;
    setBusy(true);
    try {
      if (action.kind === 'exclude') {
        await api.post(`/registrations/${action.reg.id}/exclude`, { reason });
      } else {
        await api.post(`/registrations/${action.reg.id}/override`, { reason, eligible: true });
      }
      toast.success('Registration updated.');
      setAction(null);
      setReason('');
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Registrations ({data?.total ?? 0})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs">
            <input
              className="input w-full pr-9"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPage(1);
                }}
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
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {modelOptions.length > 1 && (
            <select
              className="input w-auto"
              value={modelFilter}
              onChange={(e) => {
                setModelFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by model"
            >
              <option value="all">All models</option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          {filtersActive && (
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setModelFilter('all');
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading registrations…" />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title={filtersActive ? 'No matching registrations' : 'No registrations yet'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <SortHeader label="Employee" sortKey="employee" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Model" sortKey="model" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Eligibility" sortKey="eligibility" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Date" sortKey="date" sort={sort} onSort={toggleSort} />
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="td">
                      <Link to={`/registrations/${r.id}`} className="font-medium text-brand-600">
                        {displayName(r.user)}
                      </Link>
                    </td>
                    <td className="td">
                      {r.selectedModels && r.selectedModels.length > 0 ? (
                        <ul className="space-y-0.5">
                          {r.selectedModels.map((m, i) => (
                            <li key={m.id}>
                              {r.selectedModels!.length > 1 && (
                                <span className="mr-1.5 text-xs font-semibold text-slate-400">
                                  {i + 1}.
                                </span>
                              )}
                              {m.manufacturer} {m.modelName}
                            </li>
                          ))}
                        </ul>
                      ) : r.selectedModel ? (
                        `${r.selectedModel.manufacturer} ${r.selectedModel.modelName}`
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="td"><EligibilityBadge status={r.eligibilityStatus} /></td>
                    <td className="td"><RegStatusBadge status={r.status} /></td>
                    <td className="td whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="td text-right">
                      {!['EXCLUDED', 'CANCELLED', 'COMPLETED'].includes(r.status) && (
                        <button
                          className="text-xs font-medium text-rose-600"
                          onClick={() => { setAction({ reg: r, kind: 'exclude' }); setReason(''); }}
                        >
                          Exclude
                        </button>
                      )}
                      {(r.status === 'EXCLUDED' || r.eligibilityStatus === 'INELIGIBLE') && (
                        <button
                          className="ml-2 text-xs font-medium text-emerald-600"
                          onClick={() => { setAction({ reg: r, kind: 'override' }); setReason(''); }}
                        >
                          Override
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
              <span>
                {data.total} registration(s) · page {data.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!action}
        title={action?.kind === 'exclude' ? 'Exclude registration' : 'Override eligibility'}
        danger={action?.kind === 'exclude'}
        busy={busy}
        confirmLabel={action?.kind === 'exclude' ? 'Exclude' : 'Override'}
        message={
          <div className="space-y-2">
            <p>
              {action?.kind === 'exclude'
                ? 'This registration will be excluded from the resale.'
                : 'This will mark the registration eligible despite failing an automatic check.'}
            </p>
            <textarea
              className="input"
              rows={2}
              placeholder="Reason (required, recorded in audit log)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        }
        onConfirm={submitAction}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: 'asc' | 'desc' };
  onSort: (key: string) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="th">
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <span className={active ? 'text-brand-600' : 'text-slate-300'}>
          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

function InfoCard({ resale }: { resale: Resale }) {
  const rows: [string, string][] = [
    ['Registration opens', resale.openOnPublish && resale.status === 'DRAFT' ? 'When published' : formatDateTime(resale.registrationOpenAt)],
    ['Registration closes', formatDateTime(resale.registrationCloseAt)],
    ['Expected resale', formatDateTime(resale.resaleAt)],
    ['Cooldown', `${Math.round(resale.cooldownMonths / 12)} year(s)`],
    ['Registrations', String(resale._count?.registrations ?? 0)],
  ];
  return (
    <div className="card p-5">
      <h2 className="mb-3 text-base font-semibold">Details</h2>
      <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
        {rows.map(([k, v]) => (
          <div key={k} className="py-2">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
            <dd className="mt-0.5 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TransitionsCard({ resale, onChange }: { resale: Resale; onChange: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ action: string; label: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const doTransition = async (action: string) => {
    setBusy(true);
    try {
      await api.post(`/resales/${resale.id}/${action}`);
      toast.success(`Resale ${action}d.`);
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.del(`/resales/${resale.id}`);
      toast.success('Resale deleted.');
      navigate('/admin/resales');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed.');
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const s = resale.status;
  const isDraft = s === 'DRAFT';
  const isCompleted = s === 'COMPLETED';
  const ongoing = ['SCHEDULED', 'OPEN', 'CLOSED', 'SELECTING', 'RESULTS_PENDING', 'RESULTS_PUBLISHED', 'PICKUP'].includes(s);
  const canDelete = isDraft || s === 'CANCELLED';
  const actions: { action: string; label: string; danger?: boolean; confirm?: boolean }[] = [];
  if (s === 'SCHEDULED') actions.push({ action: 'publish', label: 'Re-validate & publish' });
  if (s === 'OPEN' || s === 'SCHEDULED')
    actions.push({ action: 'close', label: 'Close registration', confirm: true });
  if (ongoing) actions.push({ action: 'cancel', label: 'Cancel resale', danger: true, confirm: true });

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-base font-semibold">Lifecycle</h2>
      {isCompleted ? (
        <p className="text-sm text-slate-400">Resale completed.</p>
      ) : isDraft ? (
        <div className="flex flex-col gap-2">
          <button
            className="btn-success"
            disabled={busy}
            onClick={() => navigate(`/admin/resales/${resale.id}/review`)}
          >
            Review &amp; publish
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => navigate('/admin/resales')}
          >
            Save draft only
          </button>
        </div>
      ) : actions.length === 0 ? (
        <p className="text-sm text-slate-400">No lifecycle actions available in this state.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {actions.map((a) => (
            <button
              key={a.action}
              className={a.danger ? 'btn-danger' : a.action === 'publish' ? 'btn-success' : 'btn-secondary'}
              disabled={busy}
              onClick={() => (a.confirm ? setConfirm({ action: a.action, label: a.label }) : doTransition(a.action))}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
        {canDelete ? (
          <>
            <button className="btn-danger w-full" disabled={busy} onClick={() => setConfirmDelete(true)}>
              {isDraft ? 'Delete draft' : 'Delete resale'}
            </button>
            <p className="mt-2 text-xs text-slate-400">
              Permanently removes this resale and all its registrations, results and forms.
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400">
            {isCompleted
              ? 'Completed resales are kept for the record and cannot be deleted.'
              : 'On going resales can be cancelled but not deleted.'}
          </p>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          open
          title={confirm.label}
          message={`Are you sure you want to ${confirm.label.toLowerCase()}? This will be recorded in the audit log.`}
          confirmLabel="Confirm"
          onConfirm={() => doTransition(confirm.action)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          open
          title={isDraft ? 'Delete draft' : 'Delete resale'}
          message={`This permanently deletes "${resale.title}" and every registration, result, form and handover tied to it. This cannot be undone.`}
          confirmLabel="Delete permanently"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function ModelsSection({
  resale,
  catalog,
  availableByModel,
  editable,
  onChange,
}: {
  resale: Resale;
  catalog: LaptopModel[];
  availableByModel: Record<string, number>;
  editable: boolean;
  onChange: () => void;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [laptopModelId, setLaptopModelId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  const models = resale.models ?? [];
  const available = laptopModelId ? availableByModel[laptopModelId] ?? 0 : 0;
  const overStock = Boolean(laptopModelId) && quantity > available;

  const add = async () => {
    if (!laptopModelId) return;
    setBusy(true);
    try {
      await api.post(`/resales/${resale.id}/models`, {
        laptopModelId,
        quantity: Number(quantity),
      });
      toast.success('Model added.');
      setAdding(false);
      setLaptopModelId('');
      setQuantity(1);
      onChange();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to add model.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (modelId: string) => {
    await api.del(`/resales/${resale.id}/models/${modelId}`);
    toast.success('Model removed.');
    onChange();
  };

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Laptop models ({models.length})</h2>
        {editable && !adding && (
          <button className="btn-secondary" onClick={() => setAdding(true)}>
            Add model
          </button>
        )}
      </div>

      {models.length === 0 ? (
        <EmptyState title="No models yet" hint="Add at least one laptop model before publishing." />
      ) : (
        <div className="space-y-2">
          {models.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div>
                <p className="font-medium">
                  {m.laptopModel.manufacturer} {m.laptopModel.modelName}
                </p>
                <p className="text-xs text-slate-400">
                  {m.quantity} unit(s) · {currency(m.price, m.laptopModel.currency)}
                </p>
              </div>
              {editable && (
                <button className="text-sm font-medium text-rose-600" onClick={() => remove(m.laptopModelId)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
          <Field label="Laptop model" required>
            <select className="input" value={laptopModelId} onChange={(e) => setLaptopModelId(e.target.value)}>
              <option value="">Select a model…</option>
              {catalog
                .filter((c) => (availableByModel[c.id] ?? 0) > 0)
                .map((c) => {
                  const avail = availableByModel[c.id] ?? 0;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.manufacturer} {c.modelName} — {avail} in inventory
                    </option>
                  );
                })}
            </select>
          </Field>
          <div className="w-40">
            <Field label="Quantity" required>
              <input
                type="number"
                min={1}
                max={available || 1}
                className="input"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </Field>
          </div>
          {laptopModelId && (
            <p className={`text-xs ${overStock ? 'text-rose-500' : 'text-slate-400'}`}>
              {available} unit(s) available in inventory.
              {overStock && ' Reduce the quantity to match the available stock.'}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={busy || !laptopModelId || available === 0 || overStock || quantity < 1}
              onClick={add}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResaleSection({ resaleId, onResaleRun }: { resaleId: string; onResaleRun: () => void }) {
  const toast = useToast();
  const preResaleQ = useApi<PreResaleStats>(`/resale-runs/${resaleId}/pre-resale`);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ resaleRunId: string }>(`/resale-runs/${resaleId}/run`);
      toast.success(`Resale completed (run ${res.resaleRunId.slice(0, 8)}).`);
      onResaleRun();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Resale failed.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const stats = preResaleQ.data;

  return (
    <div className="card p-5">
      <h2 className="mb-3 text-base font-semibold">Run the resale</h2>
      {preResaleQ.loading ? (
        <Spinner label="Computing pre-resale statistics…" />
      ) : preResaleQ.error ? (
        <ErrorBanner message={preResaleQ.error} />
      ) : stats ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-400">Total</p>
              <p className="text-lg font-semibold">{stats.totalRegistrations}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-400">Excluded</p>
              <p className="text-lg font-semibold">{stats.excludedRegistrations}</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="th">Model</th>
                  <th className="th">Units</th>
                  <th className="th">Valid entries</th>
                  <th className="th">Winners</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stats.models.map((m) => (
                  <tr key={m.laptopModelId}>
                    <td className="td font-medium">{m.modelName}</td>
                    <td className="td">{m.quantity}</td>
                    <td className="td">{m.validRegistrations}</td>
                    <td className="td">{m.winnersToSelect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn-primary" disabled={busy} onClick={() => setConfirm(true)}>
              Run resale
            </button>
          </div>
        </>
      ) : null}
      {confirm && (
        <ConfirmDialog
          open
          title="Run the resale?"
          message="The resale is deterministic and auditable. Winners and waiting lists will be generated. This cannot be undone."
          confirmLabel="Run resale"
          onConfirm={run}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function handoverBadge(h?: HandoverRecord | null): { label: string; className: string } {
  if (h?.declinedAt) return { label: 'Declined', className: 'bg-rose-100 text-rose-700' };
  if (h?.completedAt) return { label: 'Done', className: 'bg-emerald-100 text-emerald-700' };
  if (h?.claimedAt) return { label: 'Accepted', className: 'bg-amber-100 text-amber-800' };
  return { label: 'Pending', className: 'bg-slate-100 text-slate-600' };
}

function ResultsSection({
  resale,
  onChange,
  view,
}: {
  resale: Resale;
  onChange: () => void;
  view: 'winners' | 'waiting';
}) {
  const toast = useToast();
  const resultsQ = useApi<{ resale: Resale; results: ResaleResult[] }>(`/results/${resale.id}`);
  const [busy, setBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<{ registrationId: string; name: string } | null>(
    null
  );
  const [declineReason, setDeclineReason] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<{
    registrationId: string;
    name: string;
    runnerUpName?: string | null;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [resultSearch, setResultSearch] = useState('');
  const [resultStatus, setResultStatus] = useState('all');
  const [resultModel, setResultModel] = useState('all');
  const [ruOnly, setRuOnly] = useState(false);
  const pageSize = 25;

  // Reset paging when switching between the winners and waiting-list views.
  useEffect(() => {
    setPage(1);
  }, [view, resultSearch, resultStatus, resultModel, ruOnly]);

  // Reset filters when switching views (statuses differ between the two).
  useEffect(() => {
    setResultSearch('');
    setResultStatus('all');
    setResultModel('all');
    setRuOnly(false);
  }, [view]);

  const publish = async () => {
    setBusy(true);
    try {
      await api.post(`/results/${resale.id}/publish`);
      toast.success('Results published to employees.');
      onChange();
      resultsQ.refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Publish failed.');
    } finally {
      setBusy(false);
      setConfirmPublish(false);
    }
  };

  const doDecline = async () => {
    if (!declineTarget) return;
    setBusy(true);
    try {
      await api.post(`/handovers/${declineTarget.registrationId}/decline`, {
        reason: declineReason.trim(),
      });
      toast.success('Winner declined.');
      setDeclineTarget(null);
      setDeclineReason('');
      onChange();
      resultsQ.refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Decline failed.');
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (!restoreTarget) return;
    setBusy(true);
    try {
      await api.post(`/handovers/${restoreTarget.registrationId}/decline-restore`);
      toast.success('Decline restored.');
      setRestoreTarget(null);
      onChange();
      resultsQ.refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  };

  const doComplete = async () => {
    setBusy(true);
    try {
      await api.post(`/resales/${resale.id}/complete`);
      toast.success('Resale completed.');
      setConfirmComplete(false);
      onChange();
      resultsQ.refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not complete resale.');
    } finally {
      setBusy(false);
    }
  };

  if (resultsQ.loading) return <div className="card p-5"><Spinner label="Loading results…" /></div>;
  if (resultsQ.error) return <div className="card p-5"><ErrorBanner message={resultsQ.error} /></div>;
  const results = resultsQ.data?.results ?? [];
  const winners = results.filter((r) => r.resultType === 'WINNER');
  const waiting = results
    .filter((r) => r.resultType === 'WAITING_LIST')
    .sort((a, b) => {
      const ma = `${a.laptopModel?.manufacturer ?? ''} ${a.laptopModel?.modelName ?? ''}`;
      const mb = `${b.laptopModel?.manufacturer ?? ''} ${b.laptopModel?.modelName ?? ''}`;
      if (ma !== mb) return ma.localeCompare(mb);
      return a.resultOrder - b.resultOrder;
    });
  const published = resale.status !== 'RESULTS_PENDING';
  const canManageWinners = resale.status === 'RESULTS_PUBLISHED' || resale.status === 'PICKUP';
  const resolvedWinners = winners.filter(
    (r) => r.registration?.handover?.completedAt || r.registration?.handover?.declinedAt
  ).length;
  const allResolved = winners.length > 0 && resolvedWinners === winners.length;
  // Declined winners keep their row (tagged Declined) but no longer hold a laptop,
  // so the displayed counts are based on active winners only.
  const declinedWinners = winners.filter((r) => r.registration?.handover?.declinedAt).length;
  const activeWinners = winners.length - declinedWinners;
  const completedWinners = winners.filter((r) => r.registration?.handover?.completedAt).length;
  const pendingWinners = winners.filter(
    (r) => handoverBadge(r.registration?.handover).label === 'Pending'
  ).length;
  const baseRows = view === 'winners' ? winners : waiting;

  const modelOptions = Array.from(
    new Set(
      baseRows
        .map((r) => `${r.laptopModel?.manufacturer ?? ''} ${r.laptopModel?.modelName ?? ''}`.trim())
        .filter(Boolean)
    )
  ).sort();

  const statusOptions =
    view === 'winners'
      ? ['Pending', 'Accepted', 'Declined', 'Done']
      : Array.from(new Set(baseRows.map((r) => r.registration?.status ?? 'WAITING_LIST'))).sort();

  const searchLower = resultSearch.trim().toLowerCase();
  const rows = baseRows.filter((r) => {
    if (ruOnly && !r.assignment?.replacementFromResultId) return false;
    if (resultModel !== 'all') {
      const m = `${r.laptopModel?.manufacturer ?? ''} ${r.laptopModel?.modelName ?? ''}`.trim();
      if (m !== resultModel) return false;
    }
    if (resultStatus !== 'all') {
      const status =
        view === 'winners'
          ? handoverBadge(r.registration?.handover).label
          : r.registration?.status ?? 'WAITING_LIST';
      if (status !== resultStatus) return false;
    }
    if (searchLower) {
      const hay = [displayName(r.registration?.user), r.registration?.user?.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    return true;
  });
  const filtersActive = Boolean(searchLower) || resultStatus !== 'all' || resultModel !== 'all' || ruOnly;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          Results — {activeWinners} winners
          {declinedWinners > 0 && ` · ${declinedWinners} declined`} · {waiting.length} waiting
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {!published && (
            <button className="btn-success" disabled={busy} onClick={() => setConfirmPublish(true)}>
              Publish results
            </button>
          )}
          {canManageWinners && winners.length > 0 && (
            <ComposeEmailButton
              resaleId={resale.id}
              path="pickup-email"
              label="Send pickup details"
              description={(n) =>
                `Goes to ${n} winner${n === 1 ? '' : 's'}, wherever they are in the handover flow. Winners who declined are skipped.`
              }
              disabled={busy}
            />
          )}
          {canManageWinners && pendingWinners > 0 && (
            <ComposeEmailButton
              resaleId={resale.id}
              path="pending-notice"
              label="Send pending notice"
              description={(n) =>
                `Goes to ${n} winner${n === 1 ? '' : 's'} who ${n === 1 ? "hasn't" : "haven't"} accepted their laptop yet.`
              }
              disabled={busy}
            />
          )}
          {canManageWinners && (
            <button
              className="btn-success"
              disabled={busy || !allResolved}
              onClick={() => setConfirmComplete(true)}
              title={allResolved ? undefined : 'All handovers must be completed or forfeited first.'}
            >
              Complete resale
            </button>
          )}
        </div>
      </div>
      {canManageWinners && winners.length > 0 && (
        <p className="mb-3 text-xs text-slate-400">
          {completedWinners} of {activeWinners} handovers completed.{' '}
          {allResolved
            ? 'You can now complete the resale.'
            : 'Complete or forfeit every winner before closing the resale.'}
        </p>
      )}

      {view === 'waiting' && (
        <p className="mb-3 text-xs text-slate-400">
          The order laptops are offered if a winner forfeits. Position is per model.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1 min-w-[200px]">
          <input
            className="input w-full pr-9"
            placeholder="Search name or email"
            value={resultSearch}
            onChange={(e) => setResultSearch(e.target.value)}
          />
          {resultSearch && (
            <button
              type="button"
              onClick={() => setResultSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              ✕
            </button>
          )}
        </div>
        <select
          className="input w-auto"
          value={resultStatus}
          onChange={(e) => setResultStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {modelOptions.length > 1 && (
          <select
            className="input w-auto"
            value={resultModel}
            onChange={(e) => setResultModel(e.target.value)}
            aria-label="Filter by model"
          >
            <option value="all">All models</option>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
        {view === 'winners' && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={ruOnly}
              onChange={(e) => setRuOnly(e.target.checked)}
            />
            RU-Winner only
          </label>
        )}
        {filtersActive && (
          <button
            type="button"
            className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            onClick={() => {
              setResultSearch('');
              setResultStatus('all');
              setResultModel('all');
              setRuOnly(false);
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={
            filtersActive
              ? 'No matching results'
              : view === 'winners'
                ? 'No results'
                : 'No one on the waiting list'
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="th">#</th>
                <th className="th">Employee</th>
                <th className="th">Model</th>
                <th className="th">Status</th>
                {view === 'winners' && canManageWinners && <th className="th"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pageRows.map((r) => {
                if (view === 'waiting') {
                  return (
                    <tr key={r.id}>
                      <td className="td">{r.resultOrder + 1}</td>
                      <td className="td font-medium">{displayName(r.registration?.user)}</td>
                      <td className="td">
                        {r.laptopModel?.manufacturer} {r.laptopModel?.modelName}
                      </td>
                      <td className="td">
                        <RegStatusBadge status={r.registration?.status ?? 'WAITING_LIST'} />
                      </td>
                    </tr>
                  );
                }
                const badge = handoverBadge(r.registration?.handover);
                const isRunnerUp = Boolean(r.assignment?.replacementFromResultId);
                return (
                  <tr key={r.id}>
                    <td className="td">{r.resultOrder + 1}</td>
                    <td className="td font-medium">
                      <span className="inline-flex items-center gap-2">
                        {displayName(r.registration?.user)}
                        {isRunnerUp && (
                          <span
                            className="badge bg-violet-100 text-violet-700"
                            title="Promoted from the waiting list after a winner was declined"
                          >
                            RU-Winner
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="td">
                      {r.laptopModel?.manufacturer} {r.laptopModel?.modelName}
                    </td>
                    <td className="td">
                      <span className={`badge ${badge.className}`}>{badge.label}</span>
                    </td>
                    {canManageWinners && (
                      <td className="td text-right">
                        {!r.registration?.handover?.completedAt &&
                          !r.registration?.handover?.declinedAt &&
                          r.registration?.id && (
                            <button
                              className="text-sm font-medium text-rose-600"
                              onClick={() =>
                                setDeclineTarget({
                                  registrationId: r.registration!.id,
                                  name: displayName(r.registration?.user),
                                })
                              }
                            >
                              Decline
                            </button>
                          )}
                        {r.registration?.handover?.declinedAt &&
                          !r.registration?.handover?.completedAt &&
                          r.registration?.id && (
                            <button
                              className="text-sm font-medium text-brand-600"
                              onClick={() => {
                                const runnerUp = winners.find(
                                  (w) => w.assignment?.replacementFromResultId === r.id
                                );
                                setRestoreTarget({
                                  registrationId: r.registration!.id,
                                  name: displayName(r.registration?.user),
                                  runnerUpName: runnerUp
                                    ? displayName(runnerUp.registration?.user)
                                    : null,
                                });
                              }}
                            >
                              Restore
                            </button>
                          )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
              <span>
                {rows.length} {rows.length === 1 ? 'entry' : 'entries'} · page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirmPublish && (
        <ConfirmDialog
          open
          title="Publish results?"
          message="Employees will be notified of their outcome. Make sure you have reviewed the resale."
          confirmLabel="Publish"
          onConfirm={publish}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
      {declineTarget && (
        <ConfirmDialog
          open
          danger
          title={`Decline ${declineTarget.name}`}
          message={
            <div className="space-y-2">
              <p>
                This releases the laptop from {declineTarget.name} and promotes the next
                waiting-list entry (if any). You can restore it later, but only while no
                runner-up has been promoted in their place.
              </p>
              <textarea
                className="input"
                rows={3}
                placeholder="Reason (required)"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
              />
              <p className="text-xs font-medium text-rose-600">
                * This reason will be shown to the employee.
              </p>
            </div>
          }
          confirmLabel="Decline winner"
          busy={busy}
          confirmDisabled={declineReason.trim().length < 2}
          onConfirm={doDecline}
          onCancel={() => {
            setDeclineTarget(null);
            setDeclineReason('');
          }}
        />
      )}
      {restoreTarget && (
        <ConfirmDialog
          open
          title={`Restore ${restoreTarget.name}?`}
          message={
            <div className="space-y-2">
              <p>
                This undoes the decline and puts {restoreTarget.name} back as a winner who
                still needs to claim their laptop.
              </p>
              {restoreTarget.runnerUpName && (
                <p className="text-xs text-amber-600">
                  Note: {restoreTarget.runnerUpName} was promoted from the waiting list and
                  already notified they won. Restoring won't remove them — you'll need to
                  resolve their assignment separately.
                </p>
              )}
            </div>
          }
          confirmLabel="Approve restore"
          cancelLabel="Back"
          busy={busy}
          onConfirm={doRestore}
          onCancel={() => setRestoreTarget(null)}
        />
      )}
      {confirmComplete && (
        <ConfirmDialog
          open
          title="Complete resale?"
          message="This closes the resale for good. Only do this once every winner has collected their laptop or forfeited."
          confirmLabel="Complete resale"
          busy={busy}
          onConfirm={doComplete}
          onCancel={() => setConfirmComplete(false)}
        />
      )}
    </div>
  );
}
