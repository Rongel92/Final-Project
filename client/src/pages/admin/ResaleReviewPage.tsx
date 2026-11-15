import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Resale } from '../../lib/types';
import { EmptyState, ErrorBanner, PageHeader, Spinner, StatusBadge } from '../../components/ui';
import { ResaleWizardSteps } from '../../components/ResaleWizardSteps';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { currency, formatDateTime } from '../../lib/constants';

// Step 3 of the resale wizard: a read-only summary of everything configured so
// far, with the single Publish action that opens registration.
export function ResaleReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const resaleQ = useApi<Resale>(`/resales/${id}`);
  const resale = resaleQ.data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (resaleQ.loading) return <Spinner label="Loading resale…" />;
  if (resaleQ.error) return <ErrorBanner message={resaleQ.error} />;
  if (!resale) return null;

  const models = resale.models ?? [];
  const editable = ['DRAFT', 'SCHEDULED'].includes(resale.status);
  const isDraft = resale.status === 'DRAFT';

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/resales/${resale.id}/publish`);
      toast.success('Resale published. Registration will open automatically at the scheduled time.');
      navigate(`/admin/resales/${resale.id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Publish failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.del(`/resales/${resale.id}`);
      toast.success('Draft deleted.');
      navigate('/admin/resales');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Delete failed.');
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const rows: [string, string][] = [
    ['Registration opens', resale.openOnPublish ? 'When published' : formatDateTime(resale.registrationOpenAt)],
    ['Registration closes', formatDateTime(resale.registrationCloseAt)],
    ['Expected resale', formatDateTime(resale.resaleAt)],
    ['Cooldown', `${Math.round(resale.cooldownMonths / 12)} year(s)`],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={resale.title}
        subtitle="Step 3 — Review the resale and publish to open registration."
        actions={<StatusBadge status={resale.status} />}
      />
      <ResaleWizardSteps current="review" resaleId={resale.id} />

      {!editable && (
        <div className="mb-4">
          <ErrorBanner message="This resale has already been published and can no longer be reviewed as a draft." />
        </div>
      )}

      <div className="card space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold">General information</h2>
          {resale.description ? (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{resale.description}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No description.</p>
          )}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className="mt-0.5 text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card mt-6 space-y-3 p-6">
        <h2 className="text-base font-semibold">Laptop models ({models.length})</h2>
        {models.length === 0 ? (
          <EmptyState title="No models yet" hint="Add at least one laptop model before publishing." />
        ) : (
          <div className="space-y-2">
            {models.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <p className="font-medium">
                  {m.laptopModel.manufacturer} {m.laptopModel.modelName}
                </p>
                <p className="text-xs text-slate-400">
                  {m.quantity} unit(s) · {currency(m.price, m.laptopModel.currency)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <button className="btn-secondary" onClick={() => navigate(`/admin/resales/${resale.id}`)}>
          Back to models
        </button>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <button className="btn-secondary" disabled={busy} onClick={() => navigate('/admin/resales')}>
              Save draft only
            </button>
          )}
          <button
            className="btn-success"
            disabled={busy || !editable || models.length === 0}
            onClick={publish}
          >
            {busy ? 'Publishing…' : 'Publish (open registration)'}
          </button>
        </div>
      </div>

      {isDraft && (
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button className="btn-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
            Delete draft
          </button>
          <p className="mt-2 text-xs text-slate-400">
            Permanently removes this resale and all its registrations, results and forms.
          </p>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open
          title="Delete draft"
          message={`This permanently deletes "${resale.title}" and every registration, result, form and handover tied to it. This cannot be undone.`}
          confirmLabel="Delete permanently"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
