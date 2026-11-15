import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/useApi';
import type { EligibilityResult, Resale, Registration } from '../../lib/types';
import { displayName } from '../../lib/types';
import { LaptopModelCard } from '../../components/LaptopModelCard';
import { PriorityList } from '../../components/PriorityList';
import { ErrorBanner, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { currency, MULTI_CHOICE_DISCLAIMER } from '../../lib/constants';

const STEPS = ['Select model', 'Review & submit'];

export function RegistrationWizardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const { data: resale, loading } = useApi<Resale>(`/resales/${id}`);
  const { data: eligibility } = useApi<EligibilityResult>(id ? `/eligibility/check/${id}` : null);

  const [step, setStep] = useState(0);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [multiAck, setMultiAck] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const toggleModel = (laptopModelId: string) =>
    setSelectedModelIds((prev) =>
      prev.includes(laptopModelId)
        ? prev.filter((x) => x !== laptopModelId)
        : [...prev, laptopModelId]
    );

  const selectedLinks = selectedModelIds
    .map((id) => (resale?.models ?? []).find((m) => m.laptopModelId === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const isMulti = selectedModelIds.length > 1;

  const priorityItems = selectedLinks.map((link) => ({
    id: link.laptopModelId,
    label: `${link.laptopModel.manufacturer} ${link.laptopModel.modelName}`,
  }));

  if (loading) return <Spinner label="Loading registration…" />;
  if (!resale) return <ErrorBanner message="Resale not found." />;

  if (eligibility && eligibility.status === 'INELIGIBLE') {
    return (
      <div>
        <PageHeader title="Registration" subtitle={resale.title} />
        <div className="card p-6">
          <ErrorBanner message={`You cannot register: ${eligibility.reason}`} />
          <button className="btn-secondary mt-4" onClick={() => navigate('/dashboard')}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-semibold">Registration submitted</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your registration for “{resale.title}” has been received.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            You will be notified of the results.
          </p>
          <div className="mt-6 flex justify-center">
            <button className="btn-primary" onClick={() => navigate('/dashboard')}>
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canNext = step === 0 && selectedModelIds.length >= 1 && (!isMulti || multiAck);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.post<Registration>('/registrations', {
        resaleId: id,
        selectedLaptopModelIds: selectedModelIds,
        multiChoiceAck: isMulti ? multiAck : false,
        typedFullName: user?.fullName || displayName(user),
      });
      setSubmitted(true);
      toast.success('Registration submitted successfully.');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Submission failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Register for resale" subtitle={resale.title} />

      <ol className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                i <= step ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
              }`}
            >
              {i + 1}
            </span>
            <span className={`hidden text-xs font-medium sm:inline ${i === step ? '' : 'text-slate-400'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />}
          </li>
        ))}
      </ol>

      <div className="card p-6">
        {step === 0 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Select one or more laptop models</h2>
            <p className="mb-4 text-sm text-slate-500">
              You can pick more than one model to increase your chances — but you can win at most
              one laptop across the models you choose.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {resale.models?.map((m) => (
                <LaptopModelCard
                  key={m.id}
                  model={m.laptopModel}
                  price={m.price}
                  quantity={m.quantity}
                  pickupLocation={m.pickupLocation}
                  selected={selectedModelIds.includes(m.laptopModelId)}
                  onSelect={() => toggleModel(m.laptopModelId)}
                />
              ))}
            </div>

            {isMulti && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold">Set your priority</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Rank your choices from most to least wanted. This priority will be taken into
                  consideration when allocating laptops to winners.
                </p>
                <PriorityList items={priorityItems} onReorder={setSelectedModelIds} />
              </div>
            )}

            {isMulti && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={multiAck}
                  onChange={(e) => setMultiAck(e.target.checked)}
                />
                <span>{MULTI_CHOICE_DISCLAIMER}</span>
              </label>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Review and submit</h2>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
                <p className="font-medium">{displayName(user)}</p>
                <p className="text-xs text-slate-400">{user?.email}</p>
              </div>
              {selectedLinks.map((link, i) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    {isMulti && (
                      <span className="grid h-7 w-12 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                        {['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][i] ?? `${i + 1}th`}
                      </span>
                    )}
                    <p className="font-medium">
                      {link.laptopModel.manufacturer} {link.laptopModel.modelName}
                    </p>
                  </div>
                  <p className="font-semibold text-brand-700">{currency(link.price, link.laptopModel.currency)}</p>
                </div>
              ))}
              {isMulti && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  You selected {selectedLinks.length} models. You can be selected for at most one of
                  them.
                </p>
              )}
              <p className="text-xs text-slate-400">
                Registration deadline: {new Date(resale.registrationCloseAt).toLocaleString()}
              </p>
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                If you are selected, you will review and sign the purchase agreement when you collect
                the laptop.
              </p>
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <p className="mb-3 text-sm font-medium">Terms &amp; Conditions</p>
                <a
                  href="/terms-resale-pilot.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <span aria-hidden="true">📄</span> Open Terms &amp; Conditions
                </a>
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                  />
                  <span>I have read and accept the Terms &amp; Conditions.</span>
                </label>
              </div>
              {error && <ErrorBanner message={error} />}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button
            className="btn-secondary"
            onClick={() => (step === 0 ? navigate('/dashboard') : setStep((s) => s - 1))}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Continue
            </button>
          ) : (
            <button className="btn-primary" disabled={submitting || !termsAccepted} onClick={submit}>
              {submitting ? 'Submitting…' : 'Submit registration'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
