import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Registration } from '../../lib/types';
import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  RegStatusBadge,
  Spinner,
} from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../lib/constants';

export function RegistrationDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: reg, loading, error, refetch } = useApi<Registration>(`/registrations/${id}`);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner label="Loading registration…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!reg) return <EmptyState title="Registration not found" />;

  const selectedIds =
    reg.modelChoices && reg.modelChoices.length > 0
      ? reg.modelChoices.map((c) => c.laptopModelId)
      : reg.selectedLaptopModelId
        ? [reg.selectedLaptopModelId]
        : [];
  const selectedModels = selectedIds
    .map((id) => reg.resale?.models?.find((m) => m.laptopModelId === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const canCancel =
    reg.resale?.allowCancellation &&
    !['WINNER', 'COMPLETED', 'CANCELLED'].includes(reg.status);

  const cancel = async () => {
    setBusy(true);
    try {
      await api.post(`/registrations/${reg.id}/cancel`);
      toast.success('Registration cancelled.');
      refetch();
      setConfirmCancel(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Cancellation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Registration details"
        subtitle={reg.resale?.title}
        actions={<RegStatusBadge status={reg.status} />}
      />

      <div className="space-y-4">
        {reg.status === 'WINNER' && (
          <div className="card border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/40">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-900">
                🎉
              </span>
              <div>
                <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-200">
                  Congratulations — you won!
                </h2>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  You have been selected in this resale. Continue to accept your selection, review and
                  sign the handover form and arrange collection of your laptop.
                </p>
              </div>
            </div>
            <Link to={`/pickup/${reg.id}`} className="btn-primary mt-4 inline-block">
              Accept selection
            </Link>
          </div>
        )}

        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold">Resale</h2>
          <p className="font-medium">{reg.resale?.title}</p>
          <p className="text-sm text-slate-500">{reg.resale?.description}</p>
          <Link to={`/resales/${reg.resaleId}`} className="mt-2 inline-block text-sm text-brand-600">
            View resale →
          </Link>
        </div>

        {selectedModels.length > 0 && (
          <div className="card p-5">
            <h2 className="mb-3 text-base font-semibold">
              {selectedModels.length > 1 ? 'Selected models' : 'Selected model'}
            </h2>
            {selectedModels.length > 1 && (
              <p className="mb-3 text-xs font-medium text-slate-400">
                You selected {selectedModels.length} models — you can win at most one.
              </p>
            )}
            <ul className="space-y-2">
              {selectedModels.map((m, i) => (
                <li key={m.laptopModelId} className="flex items-center gap-3">
                  {selectedModels.length > 1 && (
                    <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                      {['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][i] ?? `${i + 1}th`}
                    </span>
                  )}
                  <span className="font-medium">
                    {m.laptopModel.manufacturer} {m.laptopModel.modelName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold">Submission</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-400">Submitted</dt>
            <dd>{formatDateTime(reg.submittedAt ?? reg.createdAt)}</dd>
            <dt className="text-slate-400">Typed confirmation</dt>
            <dd>{reg.typedFullName}</dd>
            <dt className="text-slate-400">Eligibility</dt>
            <dd>{reg.eligibilityStatus}</dd>
            <dt className="text-slate-400">Terms accepted</dt>
            <dd>{reg.termsAccepted ? 'Yes' : 'No'}</dd>
          </dl>
        </div>

        {reg.declarations && reg.declarations.length > 0 && (
          <div className="card p-5">
            <h2 className="mb-3 text-base font-semibold">Accepted declarations</h2>
            <ul className="space-y-1.5 text-sm text-slate-500">
              {reg.declarations.map((d) => (
                <li key={d.id} className="flex items-start gap-2">
                  <span className="text-emerald-600">✓</span>
                  {d.declarationText}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-between">
          <button className="btn-secondary" onClick={() => navigate('/my-registrations')}>
            Back
          </button>
          {canCancel && (
            <button className="btn-danger" onClick={() => setConfirmCancel(true)}>
              Cancel registration
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel registration?"
        message="This will remove you from the resale. This action cannot be undone."
        confirmLabel="Cancel registration"
        danger
        busy={busy}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
