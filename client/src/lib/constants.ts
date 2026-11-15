// UI-facing labels and colour mappings for status/type codes.

export const RESALE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  OPEN: 'Open',
  CLOSED: 'Registration closed',
  SELECTING: 'Selecting winners',
  RESULTS_PENDING: 'Results pending publication',
  RESULTS_PUBLISHED: 'Results published',
  PICKUP: 'Acceptance window open',
  COMPLETED: 'Finished',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
};

export const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  SCHEDULED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  OPEN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  CLOSED: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  SELECTING: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  RESULTS_PENDING: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  RESULTS_PUBLISHED: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
  PICKUP: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
  COMPLETED: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  ARCHIVED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  CANCELLED: 'Cancelled',
  EXCLUDED: 'Excluded',
  WINNER: 'Selected',
  WAITING_LIST: 'Waiting list',
  NOT_SELECTED: 'Not selected',
  DECLINED: 'Declined',
  COMPLETED: 'Completed',
};

export const REGISTRATION_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
  CANCELLED: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  EXCLUDED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  WINNER: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  WAITING_LIST: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  NOT_SELECTED: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  DECLINED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
};

export const ELIGIBILITY_COLORS: Record<string, string> = {
  ELIGIBLE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  OVERRIDDEN: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200',
  INELIGIBLE: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};

export const LAPTOP_CONDITIONS = [
  'Excellent',
  'Very good',
  'Good',
  'Fair',
  'Refurbished',
  'Cosmetic damage',
  'Battery replacement recommended',
];

export const MULTI_CHOICE_DISCLAIMER =
  'I understand that by selecting more than one laptop model I may be selected for at most one of them, and I accept receiving any single one of the models I have chosen.';

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeRemaining(closeAt?: string | null): string {
  if (!closeAt) return '—';
  const ms = new Date(closeAt).getTime() - Date.now();
  if (ms <= 0) return 'Closed';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ${hours}h remaining`;
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m remaining`;
}

export function currency(value?: number | null, code?: string | null): string {
  if (value === null || value === undefined) return '—';
  const currencyCode = code || 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value);
  } catch {
    return `${currencyCode} ${new Intl.NumberFormat(undefined).format(value)}`;
  }
}

// All ISO currency codes for the inventory currency selector, falling back to a
// common list on older engines that lack Intl.supportedValuesOf.
export const CURRENCY_OPTIONS: string[] = (() => {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supported === 'function') {
      const list = supported('currency');
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch {
    // fall through to the static list
  }
  return ['USD', 'EUR', 'GBP', 'ILS', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'INR', 'SEK', 'NOK', 'DKK', 'PLN'];
})();

// Shekel amount used in the purchase agreement (e.g. "3,500 ₪").
export function shekels(value?: number | null): string {
  if (value === null || value === undefined) return 'XXXX ₪';
  return `${new Intl.NumberFormat('he-IL').format(value)} ₪`;
}

// The purchase / handover agreement the employee signs when accepting the laptop.
export const PURCHASE_AGREEMENT_INTRO = 'I hereby confirm that:';

export function purchaseAgreementItems(price?: number | null): string[] {
  return [
    'I accept the terms and conditions of the sale.',
    'I have received the computer.',
    'I understand that the computer is used and is provided in its current condition ("As Is").',
    'The computer has undergone a basic functionality check prior to delivery.',
    'The computer is provided without warranty.',
    `The purchase price of ${shekels(price)} will be deducted from my net salary.`,
    'I understand that the computer cannot be returned or exchanged, and the transaction cannot be canceled.',
  ];
}

