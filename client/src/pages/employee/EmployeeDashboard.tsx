import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useAuth } from '../../lib/auth';
import type { Resale } from '../../lib/types';
import { ErrorBanner, Spinner } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { LaptopModelCard } from '../../components/LaptopModelCard';
import { PriorityList } from '../../components/PriorityList';
import { useToast } from '../../components/Toast';
import { currency, formatDate, formatDateTime, MULTI_CHOICE_DISCLAIMER } from '../../lib/constants';

// Resale phases shown to employees, split into "before the resale" (countdown) and
// "after the resale" (results).
const PRE_RESULT = ['SCHEDULED', 'OPEN', 'CLOSED', 'SELECTING', 'RESULTS_PENDING'];
const RESULT = ['RESULTS_PUBLISHED', 'PICKUP', 'COMPLETED'];

const PHASE_LABEL: Record<string, string> = {
  SCHEDULED: 'Opening soon',
  OPEN: 'Registration open',
  CLOSED: 'Registration closed',
  SELECTING: 'Resale in progress',
  RESULTS_PENDING: 'Awaiting results',
};

const DISMISS_KEY = 'resale.dismissedResults';

// Dismissals are scoped per user so one account's dismissals never hide another
// account's result/decline cards (localStorage is shared across users per browser).
function dismissKey(userId?: string): string {
  return userId ? `${DISMISS_KEY}.${userId}` : DISMISS_KEY;
}

function loadDismissed(userId?: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(dismissKey(userId)) || '[]');
  } catch {
    return [];
  }
}

function NoResale() {
  return (
    <div className="grid min-h-[70vh] place-items-center px-4 text-center">
      <div className="max-w-xl">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-3xl dark:bg-slate-800">
          💻
        </div>
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
          No resale is currently running
        </h1>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="sm:whitespace-nowrap">
            There is no laptop resale going on right now. Please check back later
          </span>
          <br />
          a new resale will appear here once it opens.
        </p>
      </div>
    </div>
  );
}

function Countdown({ target }: { target?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) {
    return (
      <p className="mt-6 text-lg font-medium text-slate-500 dark:text-slate-400">
        The resale is underway…
      </p>
    );
  }

  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const blocks: [string, number][] = [
    ['Days', days],
    ['Hours', hours],
    ['Minutes', minutes],
    ['Seconds', seconds],
  ];

  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      {blocks.map(([label, value]) => (
        <div
          key={label}
          className="min-w-0 max-w-[84px] flex-1 rounded-xl bg-slate-100 px-1 py-3 dark:bg-slate-800"
        >
          <div className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
            {String(value).padStart(2, '0')}
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmployeeDashboard() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApi<Resale[]>('/resales', [], 5000);
  const { data: eligibility } = useApi<{
    eligible: boolean;
    nextEligibleAt?: string | null;
    reason?: string;
  }>('/eligibility/me', [], 30000);
  const [dismissed, setDismissed] = useState<string[]>(() => loadDismissed(user?.id));

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(dismissKey(user?.id), JSON.stringify(next));
  };

  if (loading && !data) return <Spinner label="Loading…" />;
  if (error) return <ErrorBanner message={error} />;

  const resales = data ?? [];
  const ineligible = eligibility ? !eligibility.eligible : false;

  // Show a card for every pre-result resale, plus result resales that concern this
  // user (they registered) and haven't been dismissed yet. Users in a cooldown
  // period cannot register, so registrable (pre-result) resales are hidden.
  const visible = resales.filter((d) => {
    if (PRE_RESULT.includes(d.status)) return !ineligible;
    if (RESULT.includes(d.status)) {
      const r = d.myRegistration as { status?: string; declined?: boolean } | null;
      const registered = Boolean(r?.status) && r?.status !== 'CANCELLED';
      // A pending winner must always see their win until it is resolved (accepted
      // or forfeited) — never let it be suppressed by the dismissed list. A winner
      // an admin declined follows the normal dismissible-result rule instead.
      if (r?.status === 'WINNER' && !r?.declined) return registered;
      return registered && !dismissed.includes(d.id);
    }
    return false;
  });

  // A user may only hold one active registration at a time. Find it (if any) so
  // the register button on other resales can explain why it's blocked. A resale
  // that has ended no longer holds anyone (matches the server-side check).
  const activeRegistrationResale = resales.find((d) => {
    if (['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(d.status)) return false;
    const r = d.myRegistration as { status?: string } | null;
    return r?.status && ['SUBMITTED', 'WINNER', 'WAITING_LIST'].includes(r.status);
  });

  // Only one active registration is allowed at a time — surface a reminder when
  // more than one resale is open for registration.
  const openResaleCount = resales.filter((d) => d.status === 'OPEN').length;

  if (ineligible) {
    // While the employee still has an unacknowledged result card (e.g. a just-
    // completed handover), show that on its own. The not-eligible notice only
    // appears once they've clicked OK to dismiss it.
    if (visible.length > 0) {
      return (
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {visible.map((d) => (
              <ResaleCard
                key={d.id}
                resale={d}
                onDismiss={() => dismiss(d.id)}
                onChanged={refetch}
                blockedByOtherRegistration={
                  Boolean(activeRegistrationResale) && activeRegistrationResale?.id !== d.id
                }
              />
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-6xl">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-3xl dark:bg-amber-900/40">
            ⏳
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            You're not eligible right now
          </h1>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            You previously received a laptop and are not eligible to register again until{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {formatDate(eligibility?.nextEligibleAt)}
            </span>
            .
          </p>
        </div>
      </div>
    );
  }

  if (visible.length === 0) return <NoResale />;

  return (
    <div className="mx-auto max-w-6xl">
      {openResaleCount > 1 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          You can only register to a single resale at a time.
        </div>
      )}
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        {visible.map((d) => (
          <ResaleCard
            key={d.id}
            resale={d}
            onDismiss={() => dismiss(d.id)}
            onChanged={refetch}
            blockedByOtherRegistration={
              Boolean(activeRegistrationResale) && activeRegistrationResale?.id !== d.id
            }
          />
        ))}
      </div>
    </div>
  );
}

function ResaleCard({
  resale,
  onDismiss,
  onChanged,
  blockedByOtherRegistration,
}: {
  resale: Resale;
  onDismiss: () => void;
  onChanged: () => void;
  blockedByOtherRegistration: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelText, setCancelText] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newModelIds, setNewModelIds] = useState<string[]>([]);
  const [editAck, setEditAck] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeText, setChangeText] = useState('');
  const [saving, setSaving] = useState(false);

  const reg = (resale.myRegistration ?? null) as
    | {
        id: string;
        status: string;
        selectedLaptopModelId?: string | null;
        selectedLaptopModelIds?: string[];
        handoverAccepted?: boolean;
        declined?: boolean;
        declineReason?: string | null;
        declinedByName?: string | null;
        declineAcknowledgedAt?: string | null;
      }
    | null;
  const myStatus = reg?.status;
  const registered = Boolean(myStatus) && myStatus !== 'CANCELLED';
  const isResult = RESULT.includes(resale.status);

  const selectedIds =
    reg?.selectedLaptopModelIds && reg.selectedLaptopModelIds.length > 0
      ? reg.selectedLaptopModelIds
      : reg?.selectedLaptopModelId
        ? [reg.selectedLaptopModelId]
        : [];
  const selectedModels = selectedIds
    .map((id) => (resale.models ?? []).find((m) => m.laptopModelId === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const toggleNewModel = (laptopModelId: string) =>
    setNewModelIds((prev) =>
      prev.includes(laptopModelId)
        ? prev.filter((x) => x !== laptopModelId)
        : [...prev, laptopModelId]
    );
  const editUnchanged = newModelIds.join(',') === selectedIds.join(',');
  const editMulti = newModelIds.length > 1;
  const editPriorityItems = newModelIds
    .map((id) => (resale.models ?? []).find((m) => m.laptopModelId === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((link) => ({
      id: link.laptopModelId,
      label: `${link.laptopModel.manufacturer} ${link.laptopModel.modelName}`,
    }));

  const canCancel =
    registered &&
    resale.status === 'OPEN' &&
    resale.allowCancellation &&
    myStatus !== 'WINNER' &&
    myStatus !== 'COMPLETED';
  const canEdit = registered && resale.status === 'OPEN' && myStatus === 'SUBMITTED';

  const cancelRegistration = async () => {
    if (!reg) return;
    setCancelling(true);
    try {
      await api.post(`/registrations/${reg.id}/cancel`);
      toast.success('Registration cancelled.');
      setCancelOpen(false);
      setCancelText('');
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Cancellation failed.');
    } finally {
      setCancelling(false);
    }
  };

  const startEditing = () => {
    setNewModelIds(selectedIds);
    setEditAck(selectedIds.length > 1);
    setEditing(true);
  };

  const acceptDecline = async () => {
    if (!reg) return;
    try {
      await api.post(`/handovers/${reg.id}/decline-acknowledge`);
    } catch {
      // Acknowledging is best-effort; dismiss the card regardless.
    }
    onDismiss();
  };

  const changeModel = async () => {
    if (!reg || newModelIds.length < 1) return;
    setSaving(true);
    try {
      await api.patch(`/registrations/${reg.id}/model`, {
        selectedLaptopModelIds: newModelIds,
        multiChoiceAck: editMulti ? editAck : false,
      });
      toast.success('Your selection has been updated.');
      setChangeOpen(false);
      setChangeText('');
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="card p-6 text-center sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
          {resale.title}
        </p>

        {isResult ? (
          myStatus === 'WINNER' && !reg?.declined ? (
            reg?.handoverAccepted ? (
              <div className="mt-4">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-900/40">
                  📩
                </div>
                <h1 className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 text-balance">
                  You're all set!
                </h1>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  You accepted your laptop. You'll receive an email soon regarding your pickup date
                  and time.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-900/40">
                  🎉
                </div>
                <h1 className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 text-balance">
                  You've been selected!
                </h1>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                  Congratulations — you won a laptop in this resale. Claim it to continue.
                </p>
                {reg && (
                  <button
                    className="btn-primary mt-6 px-6 py-2.5 text-base"
                    onClick={() => navigate(`/pickup/${reg.id}`)}
                  >
                    Click here to claim
                  </button>
                )}
              </div>
            )
          ) : myStatus === 'COMPLETED' ? (
            <div className="mt-4">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-900/40">
                ✅
              </div>
              <h1 className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 text-balance">
                Your handover is complete
              </h1>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                A copy of your signed purchase agreement has been emailed to you. Enjoy your
                laptop!
              </p>
              <button className="btn-primary mt-6 px-6 py-2.5 text-base" onClick={onDismiss}>
                OK
              </button>
            </div>
          ) : myStatus === 'WAITING_LIST' ? (
            <div className="mt-4">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-3xl dark:bg-amber-900/40">
                ⏳
              </div>
              <h1 className="text-3xl font-bold text-amber-600 dark:text-amber-300 text-balance">
                You're on the waiting list
              </h1>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                You weren't selected in the first round, but if a spot opens up we'll let
                you know right away.
              </p>
            </div>
          ) : reg?.declined ? (
            <div className="mt-4">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-rose-100 text-3xl dark:bg-rose-900/40">
                ✋
              </div>
              <h1 className="text-3xl font-bold text-rose-700 dark:text-rose-300 text-balance">
                You were declined from this resale
              </h1>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                An administrator declined your selection for this resale.
              </p>
              <div className="mx-auto mt-5 max-w-md space-y-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-left dark:border-rose-900/50 dark:bg-rose-900/20">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Reason</p>
                  <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                    {reg.declineReason || 'No reason was provided.'}
                  </p>
                </div>
                {reg.declinedByName && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                      Declined by
                    </p>
                    <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200">
                      {reg.declinedByName}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button className="btn-primary px-6 py-2.5 text-base" onClick={acceptDecline}>
                  I accept
                </button>
              </div>
            </div>
          ) : myStatus === 'NOT_SELECTED' || myStatus === 'DECLINED' ? (
            <div className="mt-4">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-3xl dark:bg-slate-800">
                🍀
              </div>
              <h1 className="text-3xl font-bold text-slate-700 dark:text-slate-200 text-balance">
                You were not selected
              </h1>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Better luck next time! We'll inform you about upcoming resales.
              </p>
              <button className="btn-primary mt-6 px-6 py-2.5 text-base" onClick={onDismiss}>
                OK
              </button>
            </div>
          ) : (
            <div className="mt-4">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-3xl dark:bg-slate-800">
                🏁
              </div>
              <h1 className="text-3xl font-bold text-slate-700 dark:text-slate-200 text-balance">
                This resale has concluded
              </h1>
              <button className="btn-primary mt-6 px-6 py-2.5 text-base" onClick={onDismiss}>
                OK
              </button>
            </div>
          )
        ) : (
          <>
            <h1 className="mt-3 text-3xl font-bold text-slate-800 dark:text-slate-100 text-balance">
              {PHASE_LABEL[resale.status] ?? resale.status}
            </h1>
            {resale.resaleAt && (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Resale runs on {formatDateTime(resale.resaleAt)}
              </p>
            )}
            <Countdown target={resale.resaleAt} />

            {registered ? (
              <div className="mt-8 text-left">
                <div className="flex items-center justify-center gap-2">
                  <span className="inline-block rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    You're registered for this resale
                  </span>
                </div>

                {editing ? (
                  <div className="mt-6">
                    <p className="mb-3 text-center text-sm text-slate-500 dark:text-slate-400">
                      Choose one or more laptop models, then confirm the change. You can win at
                      most one of the models you select.
                    </p>
                    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                      {resale.models?.map((m) => (
                        <LaptopModelCard
                          key={m.id}
                          model={m.laptopModel}
                          price={m.price}
                          quantity={m.quantity}
                          pickupLocation={m.pickupLocation}
                          selected={newModelIds.includes(m.laptopModelId)}
                          onSelect={() => toggleNewModel(m.laptopModelId)}
                        />
                      ))}
                    </div>
                    {editMulti && (
                      <div className="mt-6 text-left">
                        <h3 className="text-sm font-semibold">Set your priority</h3>
                        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                          Rank your choices from most to least wanted. This priority will be taken
                          into consideration when allocating laptops to winners.
                        </p>
                        <PriorityList items={editPriorityItems} onReorder={setNewModelIds} />
                      </div>
                    )}
                    {editMulti && (
                      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-left text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={editAck}
                          onChange={(e) => setEditAck(e.target.checked)}
                        />
                        <span>{MULTI_CHOICE_DISCLAIMER}</span>
                      </label>
                    )}
                    <div className="mt-6 flex justify-center gap-2">
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setEditing(false);
                          setNewModelIds([]);
                        }}
                      >
                        Discard changes
                      </button>
                      <button
                        className="btn-primary"
                        disabled={
                          newModelIds.length < 1 ||
                          editUnchanged ||
                          (editMulti && !editAck)
                        }
                        onClick={() => setChangeOpen(true)}
                      >
                        Save selection
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {selectedModels.length > 0 && (
                      <div className="mx-auto mt-6 max-w-md space-y-4">
                        {selectedModels.length > 1 && (
                          <p className="text-center text-xs font-medium text-slate-400">
                            You selected {selectedModels.length} models — you can win at most one.
                          </p>
                        )}
                        {selectedModels.map((selectedModel, i) => (
                          <div
                            key={selectedModel.id}
                            className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
                          >
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                              {selectedModels.length > 1
                                ? `${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][i] ?? `${i + 1}th`} choice`
                                : 'Your selected laptop'}
                            </p>
                            <p className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">
                              {selectedModel.laptopModel.manufacturer} {selectedModel.laptopModel.modelName}
                            </p>
                            <dl className="mt-3 space-y-1.5 text-sm">
                              {selectedModel.laptopModel.memory && (
                                <div className="flex justify-between gap-4">
                                  <dt className="text-slate-400">Memory</dt>
                                  <dd className="font-medium">{selectedModel.laptopModel.memory}</dd>
                                </div>
                              )}
                              {selectedModel.laptopModel.storage && (
                                <div className="flex justify-between gap-4">
                                  <dt className="text-slate-400">Storage</dt>
                                  <dd className="font-medium">{selectedModel.laptopModel.storage}</dd>
                                </div>
                              )}
                              <div className="flex justify-between gap-4">
                                <dt className="text-slate-400">Price</dt>
                                <dd className="font-semibold text-brand-700">
                                  {currency(selectedModel.price, selectedModel.laptopModel.currency)}
                                </dd>
                              </div>
                              {selectedModel.pickupLocation && (
                                <div className="flex justify-between gap-4">
                                  <dt className="text-slate-400">Location</dt>
                                  <dd className="font-medium">{selectedModel.pickupLocation}</dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        ))}
                      </div>
                    )}

                    {(canEdit || canCancel) && (
                      <div className="mt-6 flex justify-center gap-2">
                        {canEdit && (
                          <button className="btn-secondary" onClick={startEditing}>
                            Edit selection
                          </button>
                        )}
                        {canCancel && (
                          <button className="btn-danger" onClick={() => setCancelOpen(true)}>
                            Cancel registration
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              resale.status === 'OPEN' && (
                <div className="mt-6">
                  <button
                    className="btn-primary px-6 py-2.5 text-base"
                    onClick={() => {
                      if (blockedByOtherRegistration) {
                        toast.error(
                          'You can only register in one resale at a time. Cancel your current registration first.'
                        );
                        return;
                      }
                      navigate(`/resales/${resale.id}/register`);
                    }}
                  >
                    Register now
                  </button>
                  {blockedByOtherRegistration && (
                    <p className="mt-3 text-xs font-medium text-amber-600 dark:text-amber-400">
                      You're already registered in another resale. Cancel it first to register here.
                    </p>
                  )}
                </div>
              )
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel registration?"
        danger
        confirmLabel="Cancel registration"
        cancelLabel="Keep registration"
        busy={cancelling}
        confirmDisabled={cancelText.trim().toLowerCase() !== 'cancel'}
        onConfirm={cancelRegistration}
        onCancel={() => {
          setCancelOpen(false);
          setCancelText('');
        }}
        message={
          <div className="space-y-3">
            <p>
              This will withresale you from “{resale.title}”. This action cannot be undone —
              you would need to register again before the deadline.
            </p>
            <p className="font-medium">
              Type <span className="font-semibold">Cancel</span> to confirm.
            </p>
            <input
              className="input"
              value={cancelText}
              onChange={(e) => setCancelText(e.target.value)}
              placeholder="Cancel"
            />
          </div>
        }
      />

      <ConfirmDialog
        open={changeOpen}
        title="Change your selection?"
        confirmLabel="Confirm change"
        cancelLabel="Go back"
        busy={saving}
        confirmDisabled={changeText.trim().toLowerCase() !== 'confirm'}
        onConfirm={changeModel}
        onCancel={() => {
          setChangeOpen(false);
          setChangeText('');
        }}
        message={
          <div className="space-y-3">
            <p>
              This will replace your currently selected laptop model for “{resale.title}”.
            </p>
            <p className="font-medium">
              Type <span className="font-semibold">confirm</span> to save the change.
            </p>
            <input
              className="input"
              value={changeText}
              onChange={(e) => setChangeText(e.target.value)}
              placeholder="confirm"
            />
          </div>
        }
      />
    </>
  );
}
