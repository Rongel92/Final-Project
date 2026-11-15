import { Link } from 'react-router-dom';

type StepKey = 'general' | 'models' | 'review';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'general', label: 'General information' },
  { key: 'models', label: 'Models' },
  { key: 'review', label: 'Review & publish' },
];

// Lets admins move freely between the resale-creation stages (before publishing)
// without losing any already-saved input. Each stage is persisted on the server
// as it is completed, so navigating back and forth is safe.
export function ResaleWizardSteps({
  current,
  resaleId,
  lockedSteps = [],
}: {
  current: StepKey;
  resaleId?: string;
  lockedSteps?: StepKey[];
}) {
  const targetFor = (key: StepKey): string | null => {
    if (!resaleId) return null;
    if (key === 'general') return `/admin/resales/${resaleId}/edit`;
    if (key === 'review') return `/admin/resales/${resaleId}/review`;
    return `/admin/resales/${resaleId}`;
  };

  return (
    <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm" aria-label="Resale setup steps">
      {STEPS.map((step, index) => {
        const to = targetFor(step.key);
        const active = step.key === current;
        const clickable = Boolean(to) && !active && !lockedSteps.includes(step.key);
        const badge = (
          <span
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition ${
              active
                ? 'bg-brand-600 text-white'
                : clickable
                  ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                active ? 'bg-white/20' : 'bg-white text-slate-500 dark:bg-slate-900'
              }`}
            >
              {index + 1}
            </span>
            {step.label}
          </span>
        );
        return (
          <div key={step.key} className="flex items-center gap-2">
            {clickable && to ? <Link to={to}>{badge}</Link> : badge}
            {index < STEPS.length - 1 && <span className="text-slate-300 dark:text-slate-600">→</span>}
          </div>
        );
      })}
    </nav>
  );
}
