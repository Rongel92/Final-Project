// Central catalog of allowed status/type values and canonical declaration text.
// SQLite has no enums, so these constants are the single source of truth used
// by validation and the frontend (mirrored in client/src/lib/constants.ts).

export const ROLES = ['EMPLOYEE', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const RESALE_STATUS = [
  'DRAFT',
  'SCHEDULED',
  'OPEN',
  'CLOSED',
  'SELECTING',
  'RESULTS_PENDING',
  'RESULTS_PUBLISHED',
  'PICKUP',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] as const;
export type ResaleStatus = (typeof RESALE_STATUS)[number];

// Statuses an employee is allowed to see in listings.
export const EMPLOYEE_VISIBLE_STATUS: ResaleStatus[] = [
  'OPEN',
  'CLOSED',
  'SELECTING',
  'RESULTS_PUBLISHED',
  'PICKUP',
  'COMPLETED',
  'SCHEDULED',
];

export const REGISTRATION_STATUS = [
  'SUBMITTED',
  'CANCELLED',
  'EXCLUDED',
  'WINNER',
  'WAITING_LIST',
  'NOT_SELECTED',
  'DECLINED',
  'COMPLETED',
] as const;

export const ELIGIBILITY_STATUS = ['ELIGIBLE', 'INELIGIBLE', 'OVERRIDDEN', 'REVIEW'] as const;

export const RESULT_TYPES = ['WINNER', 'WAITING_LIST', 'NOT_SELECTED', 'EXCLUDED'] as const;

export const WINNER_ASSIGNMENT_STATUS = [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'NO_RESPONSE',
  'INELIGIBLE',
  'CANCELLED',
  'REPLACED',
  'COMPLETED',
] as const;

export const UNIT_STATUS = [
  'AVAILABLE',
  'RESERVED',
  'ASSIGNED',
  'WAITING_PICKUP',
  'HANDED_OVER',
  'RETURNED',
  'REMOVED',
  'UNAVAILABLE',
] as const;

export const FORM_TYPES = ['RegistrationTerms', 'HandoverForm', 'SupportingDocument'] as const;

export const TERMS_VERSION = '1.0';

// The canonical set of mandatory declarations shown during registration.
export const REGISTRATION_DECLARATIONS: { key: string; text: string }[] = [
  {
    key: 'refurbished',
    text: 'I understand that the laptop is refurbished or previously used equipment.',
  },
  {
    key: 'no_warranty',
    text: 'I understand that the laptop is provided without any warranty.',
  },
  {
    key: 'no_guarantee',
    text: 'I understand that the company makes no guarantee regarding future performance, battery life, cosmetic condition, or compatibility.',
  },
  {
    key: 'payroll_deduction',
    text: 'I agree that the purchase price will be deducted from my net salary.',
  },
  {
    key: 'no_selection_guarantee',
    text: 'I understand that registration does not guarantee selection.',
  },
  {
    key: 'right_to_purchase',
    text: 'I understand that selection only grants the right to purchase the assigned laptop.',
  },
  {
    key: 'details_correct',
    text: 'I confirm that my details are correct.',
  },
  {
    key: 'eligibility_policy',
    text: 'I agree to the participation eligibility policy.',
  },
];

// The purchase / handover agreement the employee signs when accepting the laptop.
// The price line is filled in with the selected laptop's price at signing time.
export const AGREEMENT_VERSION = '1.0';

export function formatShekels(price?: number | null): string {
  if (price === null || price === undefined) return 'XXXX ₪';
  return `${new Intl.NumberFormat('he-IL').format(price)} ₪`;
}

export const PURCHASE_AGREEMENT_INTRO = 'I hereby confirm that:';

export function purchaseAgreementItems(price?: number | null): string[] {
  return [
    'I accept the terms and conditions of the sale.',
    'I have received the computer.',
    'I understand that the computer is used and is provided in its current condition ("As Is").',
    'The computer has undergone a basic functionality check prior to delivery.',
    'The computer is provided without warranty.',
    `The purchase price of ${formatShekels(price)} will be deducted from my net salary.`,
    'I understand that the computer cannot be returned or exchanged, and the transaction cannot be canceled.',
  ];
}

// Renders the full agreement text that is stored alongside the signature so the
// exact wording the employee agreed to can always be retrieved.
export function renderPurchaseAgreement(price?: number | null): string {
  return [PURCHASE_AGREEMENT_INTRO, ...purchaseAgreementItems(price).map((i) => `- ${i}`)].join('\n');
}
