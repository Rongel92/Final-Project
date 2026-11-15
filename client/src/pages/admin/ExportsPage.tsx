import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { Resale } from '../../lib/types';
import { ErrorBanner, PageHeader } from '../../components/ui';
import { useToast } from '../../components/Toast';

const EXPORTS: { type: string; label: string; description: string; needsResale?: boolean }[] = [
  { type: 'registrations', label: 'All registrations', description: 'Every registration with employee and eligibility details.', needsResale: true },
  { type: 'eligible', label: 'Eligible registrations', description: 'Registrations that passed eligibility checks.', needsResale: true },
  { type: 'ineligible', label: 'Ineligible registrations', description: 'Registrations blocked by eligibility rules.', needsResale: true },
  { type: 'winners', label: 'Winners', description: 'Selected winners per model.', needsResale: true },
  { type: 'waiting', label: 'Waiting list', description: 'Ordered waiting-list entries.', needsResale: true },
  { type: 'not-selected', label: 'Not selected', description: 'Entrants who were not selected.', needsResale: true },
  { type: 'pickup', label: 'Acceptance list', description: 'Winners due to accept their selection.', needsResale: true },
  { type: 'handovers', label: 'Handovers', description: 'Handover confirmations and status.', needsResale: true },
  { type: 'participation', label: 'Participation history', description: 'Historical participation across resales.' },
  { type: 'inventory', label: 'Inventory', description: 'All physical laptop units and status.' },
  { type: 'audit', label: 'Audit log', description: 'Full auditable activity log.' },
  { type: 'full-report', label: 'Full resale report', description: 'Multi-sheet workbook with everything for one resale.', needsResale: true },
];

export function ExportsPage() {
  const toast = useToast();
  const { data: resalesData } = useApi<Resale[]>('/resales');
  const [mode, setMode] = useState<'all' | 'specific'>('all');
  const [numberInput, setNumberInput] = useState('');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resales = resalesData ?? [];
  const resaleNumber = (l: Resale) => {
    const m = /^Resale-(\d+)$/.exec(l.title);
    return m ? Number(m[1]) : null;
  };
  const resaleByNumber = (n: number) => resales.find((l) => resaleNumber(l) === n);

  const addNumber = () => {
    const n = parseInt(numberInput, 10);
    if (!n || n < 1) {
      setError('Enter a valid resale number.');
      return;
    }
    if (selectedNumbers.includes(n)) {
      setNumberInput('');
      return;
    }
    if (!resaleByNumber(n)) {
      setError(`Resale-${n} was not found.`);
      return;
    }
    setSelectedNumbers((s) => [...s, n].sort((a, b) => a - b));
    setNumberInput('');
    setError(null);
  };

  const removeNumber = (n: number) => setSelectedNumbers((s) => s.filter((x) => x !== n));

  const download = async (type: string, needsResale?: boolean) => {
    let qs = '';
    if (needsResale && mode === 'specific') {
      if (selectedNumbers.length === 0) {
        setError('Add at least one resale number, or choose “All resales”.');
        return;
      }
      const ids = selectedNumbers
        .map((n) => resaleByNumber(n)?.id)
        .filter((id): id is string => Boolean(id));
      qs = `?resaleIds=${ids.join(',')}`;
    }
    setError(null);
    setBusy(type);
    try {
      await api.download(`/exports/${type}${qs}`, `${type}.xlsx`);
      toast.success('Export downloaded.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader title="Exports" subtitle="Download Excel (XLSX) reports for auditing and record-keeping." />

      <div className="card mb-4 space-y-3 p-4">
        <p className="label">Resale selection (for resale-specific exports)</p>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" className="h-4 w-4" checked={mode === 'all'} onChange={() => setMode('all')} />
            All resales
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              className="h-4 w-4"
              checked={mode === 'specific'}
              onChange={() => setMode('specific')}
            />
            Specific resale numbers
          </label>
        </div>

        {mode === 'specific' && (
          <div>
            <div className="flex gap-2">
              <input
                className="input max-w-[140px]"
                type="number"
                min={1}
                placeholder="Resale number"
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addNumber();
                  }
                }}
              />
              <button type="button" className="btn-secondary" onClick={addNumber}>
                Add
              </button>
            </div>
            {selectedNumbers.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedNumbers.map((n) => (
                  <span
                    key={n}
                    className="badge inline-flex items-center gap-1 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                  >
                    Resale-{n}
                    <button
                      type="button"
                      className="text-brand-500 hover:text-brand-700"
                      onClick={() => removeNumber(n)}
                      aria-label={`Remove Resale-${n}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-400">
              Type a resale number (e.g. 1 for Resale-1) and click Add. Add more than one to combine resales.
            </p>
          </div>
        )}
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EXPORTS.map((e) => (
          <div key={e.type} className="card flex flex-col justify-between p-4">
            <div>
              <p className="font-medium">{e.label}</p>
              <p className="mt-1 text-xs text-slate-400">{e.description}</p>
              {e.needsResale && (
                <span className="badge mt-2 bg-slate-100 text-slate-500">
                  {mode === 'all' ? 'All resales' : `${selectedNumbers.length} resale(s)`}
                </span>
              )}
            </div>
            <button
              className="btn-secondary mt-3"
              disabled={busy === e.type}
              onClick={() => download(e.type, e.needsResale)}
            >
              {busy === e.type ? 'Preparing…' : 'Download XLSX'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
