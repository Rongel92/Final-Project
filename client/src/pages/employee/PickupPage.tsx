import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import type { HandoverRecord, ResaleLaptopModel, Registration } from '../../lib/types';
import { displayName } from '../../lib/types';
import { EmptyState, ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui';
import { SignaturePad } from '../../components/SignaturePad';
import { useToast } from '../../components/Toast';
import {
  currency,
  formatDateTime,
  PURCHASE_AGREEMENT_INTRO,
  purchaseAgreementItems,
} from '../../lib/constants';

interface PickupData {
  registration: Registration;
  model: ResaleLaptopModel | null;
  unit: { serialNumber?: string | null; assetNumber?: string | null } | null;
  handover: HandoverRecord | null;
}

export function PickupPage() {
  const { registrationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, refetch } = useApi<PickupData>(
    `/handovers/pickup/${registrationId}`
  );

  // Pre-fill the employee name from the winner; the admin can still edit it.
  useEffect(() => {
    const winner = data?.registration?.user;
    if (winner) setFullName((prev) => prev || displayName(winner));
  }, [data]);

  const [serial, setSerial] = useState('');
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [payrollConfirmed, setPayrollConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const downloadAgreementPdf = async () => {
    setDownloadingPdf(true);
    try {
      await api.download(
        `/handovers/${registrationId}/agreement.pdf`,
        `purchase-agreement-${registrationId}.pdf`
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Download failed.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) return <Spinner label="Loading acceptance details…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <EmptyState title="Acceptance not available" />;

  const { registration: reg, model, handover } = data;
  const isAdmin = user?.role === 'ADMIN';
  const completed = !!handover?.completedAt;
  const declined = !!handover?.declinedAt;
  const claimed = !!handover?.claimedAt;

  const claimAccept = async () => {
    setBusy(true);
    try {
      await api.post(`/handovers/${registrationId}/claim`, {});
      toast.success('Laptop accepted.');
      setClaiming(false);
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not accept.');
    } finally {
      setBusy(false);
    }
  };

  const forfeit = async () => {
    setBusy(true);
    try {
      await api.post(`/handovers/${registrationId}/decline`, {
        reason: declineReason.trim() || undefined,
      });
      toast.success('Laptop forfeited.');
      setForfeiting(false);
      setClaiming(false);
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Forfeit failed.');
    } finally {
      setBusy(false);
    }
  };

  const completeHandover = async () => {
    setBusy(true);
    try {
      await api.post(`/handovers/${registrationId}/handover-complete`, {
        fullName: fullName.trim(),
        idNumber: idNumber.trim(),
        signatureData,
        payrollDeductionConfirmed: payrollConfirmed,
        serialNumber: serial.trim(),
      });
      toast.success('Handover completed.');
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not complete handover.');
    } finally {
      setBusy(false);
    }
  };

  const declineHandover = async () => {
    setBusy(true);
    try {
      await api.post(`/handovers/${registrationId}/decline`, {
        reason: declineReason.trim() || undefined,
      });
      toast.success('Handover declined.');
      setDeclining(false);
      refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Decline failed.');
    } finally {
      setBusy(false);
    }
  };

  const laptopDetails = (
    <dl className="grid grid-cols-2 gap-y-2 text-sm">
      <dt className="text-slate-400">Employee</dt>
      <dd>{displayName(reg.user ?? user)}</dd>
      <dt className="text-slate-400">Laptop model</dt>
      <dd>
        {model ? `${model.laptopModel.manufacturer} ${model.laptopModel.modelName}` : '—'}
      </dd>
      <dt className="text-slate-400">Serial number</dt>
      <dd>{handover?.serialNumber ?? data.unit?.serialNumber ?? 'To be assigned'}</dd>
      <dt className="text-slate-400">Price</dt>
      <dd>{currency(model?.price, model?.laptopModel?.currency)}</dd>
    </dl>
  );

  const lm = model?.laptopModel;
  const laptopSpecs: [string, string | null | undefined][] = [
    ['Processor', lm?.processor],
    ['Memory', lm?.memory],
    ['Storage', lm?.storage],
    ['Screen', lm?.screenSize],
    ['OS', lm?.operatingSystem],
  ];

  const laptopShowcase = (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,14rem),1fr]">
      <div className="flex h-44 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-5xl dark:bg-slate-800">
        {lm?.imagePath ? (
          <img
            src={lm.imagePath}
            alt={lm ? `${lm.manufacturer} ${lm.modelName}` : 'Laptop'}
            className="h-full w-full object-contain"
          />
        ) : (
          '💻'
        )}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {lm?.manufacturer}
        </p>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {lm?.modelName}
        </h3>
        <p className="mt-1 text-xl font-bold text-brand-700 dark:text-brand-300">
          {currency(model?.price, model?.laptopModel?.currency)}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {laptopSpecs
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-400">{k}</dt>
                <dd className="text-right font-medium text-slate-700 dark:text-slate-200">{v}</dd>
              </div>
            ))}
        </dl>
      </div>
    </div>
  );

  const agreementItems = purchaseAgreementItems(model?.price);

  // Saved-record name: Resale-<number>-<employee>, e.g. "Resale-3-Jane Doe".
  const resaleLabel = (() => {
    const t = reg.resale?.title ?? '';
    const m = /^Resale-(\d+)$/.exec(t);
    return m ? `Resale-${m[1]}` : t;
  })();
  const formName = `${resaleLabel}-${displayName(reg.user ?? user)}`;

  // Rebuild the agreement exactly as it was saved on the signed handover.
  const savedLines = (handover?.agreementText ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const savedItems = savedLines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  const signedIntro = savedItems.length
    ? (savedLines.find((l) => !l.startsWith('- ')) ?? PURCHASE_AGREEMENT_INTRO)
    : PURCHASE_AGREEMENT_INTRO;
  const signedItems = savedItems.length ? savedItems : agreementItems;

  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => {
          const from = (location.state as { from?: { tab: string; search: string } } | null)?.from;
          if (from) {
            navigate('/admin/handovers', {
              state: { restoreTab: from.tab, restoreSearch: from.search },
            });
          } else {
            navigate(-1);
          }
        }}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Back
      </button>
      <PageHeader
        title="Resale Form"
        subtitle={formName}
        actions={
          completed ? (
            <span className="badge bg-emerald-100 text-emerald-800">Handover complete</span>
          ) : declined ? (
            <span className="badge bg-rose-100 text-rose-700">Forfeited</span>
          ) : claimed ? (
            <span className="badge bg-amber-100 text-amber-800">Pending pickup</span>
          ) : (
            <span className="badge bg-slate-100 text-slate-600">Action needed</span>
          )
        }
      />

      <div className="space-y-4">
        {isAdmin ? (
          completed ? (
            <div className="card overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-6 py-4 text-white">
                <div>
                  <h2 className="text-base font-semibold">Signed purchase agreement</h2>
                  <p className="text-xs text-slate-300">{formName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={downloadAgreementPdf}
                    disabled={downloadingPdf}
                    className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs disabled:opacity-60"
                  >
                    {downloadingPdf ? 'Preparing…' : 'Download PDF'}
                  </button>
                  <span className="badge bg-emerald-100 text-emerald-800">Signed</span>
                </div>
              </div>
              <div className="space-y-6 p-6">
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Employee
                  </h3>
                  <dl className="grid grid-cols-[10rem,1fr] gap-y-1.5 text-sm">
                    <dt className="text-slate-400">Full name</dt>
                    <dd>{handover?.employeeTypedName || displayName(reg.user ?? user)}</dd>
                    <dt className="text-slate-400">ID number</dt>
                    <dd>{handover?.idNumber || '—'}</dd>
                  </dl>
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Laptop
                  </h3>
                  <dl className="grid grid-cols-[10rem,1fr] gap-y-1.5 text-sm">
                    <dt className="text-slate-400">Model</dt>
                    <dd>{lm ? `${lm.manufacturer} ${lm.modelName}` : '—'}</dd>
                    <dt className="text-slate-400">Serial number</dt>
                    <dd>{handover?.serialNumber ?? data.unit?.serialNumber ?? '—'}</dd>
                    <dt className="text-slate-400">Price</dt>
                    <dd>{currency(model?.price, model?.laptopModel?.currency)}</dd>
                  </dl>
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Agreement
                  </h3>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="mb-2 font-medium">{signedIntro}</p>
                    <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                      {signedItems.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  {handover?.payrollDeductionConfirmed && (
                    <p className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <span>✓</span>
                      <span>
                        The employee confirmed the purchase price will be deducted from their net
                        salary.
                      </span>
                    </p>
                  )}
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Signature
                  </h3>
                  {handover?.signatureData ? (
                    <img
                      src={handover.signatureData}
                      alt="Employee signature"
                      className="max-h-32 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700"
                    />
                  ) : (
                    <p className="text-sm text-slate-400">No signature on file.</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    Signed by {handover?.employeeTypedName || '—'} on{' '}
                    {formatDateTime(handover?.employeeConfirmedAt ?? handover?.completedAt)}
                  </p>
                </section>
                <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800">
                  Processed by {displayName(handover?.administrator) || '—'} · Completed{' '}
                  {formatDateTime(handover?.completedAt)}
                  {handover?.agreementVersion ? ` · Agreement v${handover.agreementVersion}` : ''}
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-5">
              <h2 className="mb-3 text-base font-semibold">Acceptance details</h2>
              {laptopDetails}
              {(declined || !claimed) && (
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs font-medium text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                  {declined
                    ? `Forfeited${handover?.declineReason ? ` — ${handover.declineReason}` : ''}.`
                    : 'Waiting for the employee to accept their win online. You can still complete the handover in person below.'}
                </p>
              )}
            </div>
          )
        ) : completed ? (
          <div className="card border-emerald-300 p-8 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-900/40">
              ✅
            </div>
            <h1 className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              Handover complete
            </h1>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Enjoy your laptop!</p>
          </div>
        ) : declined ? (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-rose-100 text-3xl dark:bg-rose-900/40">
              ✋
            </div>
            <h1 className="text-2xl font-bold text-rose-700 dark:text-rose-300">Laptop forfeited</h1>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              You forfeited this laptop on {formatDateTime(handover?.declinedAt)}.
              {handover?.declineReason ? ` Reason: ${handover.declineReason}` : ''}
            </p>
          </div>
        ) : claimed ? (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-900/40">
              📩
            </div>
            <h1 className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              You're all set!
            </h1>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              You accepted your laptop. You'll receive an email soon regarding your pickup date and
              time.
            </p>
            <div className="mx-auto mt-6 max-w-sm text-left">{laptopDetails}</div>
          </div>
        ) : !claiming ? (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl dark:bg-emerald-900/40">
              🎉
            </div>
            <h1 className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 sm:text-3xl">
              Congratulations, you won!
            </h1>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              You won a laptop in “{reg.resale?.title}”. Claim it to review the details and accept.
            </p>
            <button
              className="btn-primary mt-6 px-6 py-2.5 text-base"
              onClick={() => setClaiming(true)}
            >
              Claim your laptop
            </button>
          </div>
        ) : (
          <div className="card p-6">
            <h2 className="mb-4 text-base font-semibold">The laptop you won</h2>
            {laptopShowcase}
            {!forfeiting ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 border-t border-slate-100 pt-6 dark:border-slate-800">
                <button
                  className="btn-primary px-8 py-3 text-base"
                  disabled={busy}
                  onClick={claimAccept}
                >
                  Approve
                </button>
                <button
                  className="btn-primary bg-rose-600 px-8 py-3 text-base hover:bg-rose-700"
                  disabled={busy}
                  onClick={() => setForfeiting(true)}
                >
                  Forfeit laptop
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
                <p className="text-sm text-rose-700 dark:text-rose-300">
                  If you forfeit, you won't receive this laptop and the next person on the waiting
                  list (if any) will be offered it instead. This cannot be undone.
                </p>
                <Field label="Reason" required>
                  <textarea
                    className="input"
                    rows={2}
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Let us know why you're forfeiting"
                  />
                </Field>
                <div className="flex items-center gap-3">
                  <button
                    className="btn-primary bg-rose-600 hover:bg-rose-700"
                    disabled={busy || declineReason.trim().length < 2}
                    onClick={forfeit}
                  >
                    Confirm forfeit
                  </button>
                  <button
                    className="text-sm font-medium text-slate-500"
                    disabled={busy}
                    onClick={() => {
                      setForfeiting(false);
                      setDeclineReason('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Physical handover — captured by an administrator at pickup */}
        {isAdmin && !completed && !declined && (
          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold">Physical handover</h2>
            <p className="mb-3 text-xs text-slate-400">
              When the employee collects the laptop, have them sign the purchase agreement and record
              the unit details, then complete the handover.
            </p>
            {!claimed && (
              <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                The employee hasn't accepted their win online yet — you can still complete the
                handover in person below.
              </p>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
              <p className="mb-2 font-medium">{PURCHASE_AGREEMENT_INTRO}</p>
              <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                {agreementItems.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/40">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={payrollConfirmed}
                  onChange={(e) => setPayrollConfirmed(e.target.checked)}
                />
                <span>
                  The employee confirms the purchase price will be deducted from their net salary.
                </span>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Employee full name" required>
                  <input
                    className="input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="As it should appear on the agreement"
                  />
                </Field>
                <Field label="ID number" required>
                  <input
                    className="input"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder="Employee ID number"
                    inputMode="numeric"
                  />
                  {idNumber.trim().length > 0 && !/^\d{9,}$/.test(idNumber.trim()) && (
                    <p className="mt-1 text-xs text-rose-600">ID number must be at least 9 digits.</p>
                  )}
                </Field>
              </div>
              <Field label="Serial number" required>
                <input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} />
              </Field>
              <SignaturePad
                label="Employee signature — sign to confirm the agreement"
                onChange={setSignatureData}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="btn-primary"
                  disabled={
                    busy ||
                    fullName.trim().length < 2 ||
                    !/^\d{9,}$/.test(idNumber.trim()) ||
                    serial.trim().length < 1 ||
                    !signatureData ||
                    !payrollConfirmed
                  }
                  onClick={completeHandover}
                >
                  Complete handover
                </button>
                {!declining && (
                  <button
                    className="text-sm font-medium text-rose-600"
                    disabled={busy}
                    onClick={() => setDeclining(true)}
                  >
                    Decline / forfeit for employee
                  </button>
                )}
              </div>
              {declining && (
                <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
                  <p className="text-sm text-rose-700 dark:text-rose-300">
                    Declining releases this laptop and promotes the next waiting-list entry (if any).
                    This cannot be undone.
                  </p>
                  <Field label="Reason" required>
                    <textarea
                      className="input"
                      rows={2}
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                    />
                  </Field>
                  <p className="text-xs font-medium text-rose-600">
                    * This reason will be shown to the employee.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      className="btn-primary bg-rose-600 hover:bg-rose-700"
                      disabled={busy || declineReason.trim().length < 2}
                      onClick={declineHandover}
                    >
                      Confirm decline
                    </button>
                    <button
                      className="text-sm font-medium text-slate-500"
                      disabled={busy}
                      onClick={() => {
                        setDeclining(false);
                        setDeclineReason('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isAdmin && declined && (
          <div className="card p-5">
            <h2 className="mb-1 text-base font-semibold">Handover declined</h2>
            <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              Declined on {formatDateTime(handover?.declinedAt)}.
              {handover?.declineReason ? ` Reason: ${handover.declineReason}` : ''}
            </p>
          </div>
        )}

        {isAdmin && completed && (
          <div className="card border-emerald-300 p-5 text-center">
            <p className="text-sm font-medium text-emerald-700">
              Handover completed on {formatDateTime(handover?.completedAt)}. Enjoy your laptop!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
