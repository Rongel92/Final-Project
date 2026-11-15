import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Resale } from '../../lib/types';
import { ErrorBanner, Field, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ResaleWizardSteps } from '../../components/ResaleWizardSteps';
import { DateTimeField } from '../../components/DateTimeField';

interface FormState {
  title: string;
  description: string;
  registrationOpenAt: string;
  openOnPublish: boolean;
  resaleAt: string;
  cooldownYears: number;
}

const EMPTY: FormState = {
  title: '',
  description: '',
  registrationOpenAt: '',
  openOnPublish: false,
  resaleAt: '',
  cooldownYears: 3,
};

function toLocalInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function ResaleEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { data: existing, loading } = useApi<Resale>(isEdit ? `/resales/${id}` : null);
  const { data: allResales } = useApi<Resale[]>(isEdit ? null : '/resales');

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The next sequential resale number. Drafts hold a number only while they exist,
  // so deleting an unpublished draft frees it for the next resale.
  const nextResaleTitle = useMemo(() => {
    let max = 0;
    for (const d of allResales ?? []) {
      const m = /^Resale-(\d+)$/.exec(d.title);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `Resale-${max + 1}`;
  }, [allResales]);

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title,
        description: existing.description ?? '',
        registrationOpenAt: toLocalInput(existing.registrationOpenAt),
        openOnPublish: existing.openOnPublish ?? false,
        resaleAt: toLocalInput(existing.resaleAt),
        cooldownYears: Math.max(1, Math.round(existing.cooldownMonths / 12)),
      });
    }
  }, [existing]);

  if (isEdit && loading) return <Spinner label="Loading resale…" />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setError(null);
    if (!form.openOnPublish && !form.registrationOpenAt) {
      setError('Registration opening date is required.');
      return;
    }
    if (!form.resaleAt) {
      setError('Expected resale date is required.');
      return;
    }
    const openRef = form.openOnPublish ? new Date() : new Date(form.registrationOpenAt);
    if (new Date(form.resaleAt) <= openRef) {
      setError('Expected resale date must be after registration opens.');
      return;
    }
    // Prevent scheduling milestones in the past. Enforced when creating a resale
    // or editing a draft (a resale already in progress may legitimately have past
    // dates such as an opening date that has already occurred).
    if (!isEdit || existing?.status === 'DRAFT') {
      const now = new Date();
      const futureChecks: [string, string][] = [
        ...(form.openOnPublish
          ? []
          : ([[form.registrationOpenAt, 'Registration opening date']] as [string, string][])),
        [form.resaleAt, 'Expected resale date'],
      ];
      for (const [value, label] of futureChecks) {
        if (new Date(value) <= now) {
          setError(`${label} must be in the future.`);
          return;
        }
      }
    }
    setSaving(true);
    // Registration closes automatically when the resale runs, so it is pinned to
    // the resale date/time.
    const resaleIso = new Date(form.resaleAt).toISOString();
    const payload = {
      description: form.description,
      registrationOpenAt: form.openOnPublish
        ? undefined
        : new Date(form.registrationOpenAt).toISOString(),
      openOnPublish: form.openOnPublish,
      registrationCloseAt: resaleIso,
      resaleAt: resaleIso,
      cooldownMonths: Number(form.cooldownYears) * 12,
      eligibilityMode: 'PURCHASE',
    };
    try {
      if (isEdit) {
        await api.put(`/resales/${id}`, payload);
        toast.success('Resale updated.');
        navigate(`/admin/resales/${id}`);
      } else {
        const created = await api.post<Resale>('/resales', payload);
        toast.success('Resale created as draft. Add laptop models next.');
        navigate(`/admin/resales/${created.id}`);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Save failed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={isEdit ? 'Edit resale' : 'Create resale'}
        subtitle="Step 1 — General information. Add models and forms after saving."
      />
      <ResaleWizardSteps current="general" resaleId={isEdit ? id : undefined} />
      <div className="card space-y-4 p-6">
        <Field label="Resale number" hint="Assigned automatically. Deleting an unpublished draft frees the number for the next resale.">
          <input
            className="input bg-slate-100 dark:bg-slate-800"
            value={isEdit ? form.title : nextResaleTitle}
            disabled
            readOnly
          />
        </Field>

        <Field label="Description">
          <textarea className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Registration opens" required={!form.openOnPublish}>
            {form.openOnPublish ? (
              <div className="input flex items-center bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Opens when published
              </div>
            ) : (
              <DateTimeField value={form.registrationOpenAt} onChange={(v) => set('registrationOpenAt', v)} />
            )}
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.openOnPublish}
                onChange={(e) => set('openOnPublish', e.target.checked)}
              />
              Open as soon as the resale is published
            </label>
          </Field>
          <Field label="Expected resale date" required hint="Registration closes automatically when the resale runs.">
            <DateTimeField value={form.resaleAt} onChange={(v) => set('resaleAt', v)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cooldown (years)" hint="How long a winner must wait before entering again.">
            <input type="number" min={1} className="input" value={form.cooldownYears} onChange={(e) => set('cooldownYears', Number(e.target.value))} />
          </Field>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => navigate('/admin/resales')}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
