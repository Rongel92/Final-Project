// Shared TypeScript types mirroring the backend models (the fields the UI uses).

export interface User {
  id: string;
  fullName: string;
  email: string;
  department?: string | null;
  site?: string | null;
  country?: string | null;
  managerName?: string | null;
  role: 'EMPLOYEE' | 'ADMIN';
  isActive: boolean;
  manualEligibility?: 'ELIGIBLE' | 'INELIGIBLE' | null;
  eligibilityNote?: string | null;
}

/**
 * The name shown throughout the UI. Prefers the person's real name; Entra sends
 * it as "Surname, GivenName" so we reorder it to "GivenName Surname". Falls back
 * to the email prefix (e.g. "employee5") when no name is available.
 */
export const displayName = (
  u?: { email?: string | null; fullName?: string | null } | null,
): string => {
  if (!u) return '';
  const full = u.fullName?.trim();
  if (full) {
    const comma = full.indexOf(',');
    if (comma > -1) {
      const last = full.slice(0, comma).trim();
      const first = full.slice(comma + 1).trim();
      if (first && last) return `${first} ${last}`;
    }
    return full;
  }
  return u.email ? u.email.split('@')[0] : '';
};
export interface LaptopModel {
  id: string;
  manufacturer: string;
  modelName: string;
  processor?: string | null;
  memory?: string | null;
  storage?: string | null;
  screenSize?: string | null;
  operatingSystem?: string | null;
  condition: string;
  batteryCondition?: string | null;
  accessories?: string | null;
  description?: string | null;
  imagePath?: string | null;
  price?: number;
  currency?: string | null;
}

export interface ResaleLaptopModel {
  id: string;
  resaleId: string;
  laptopModelId: string;
  quantity: number;
  price: number;
  pickupLocation?: string | null;
  notes?: string | null;
  laptopModel: LaptopModel;
}

export interface Resale {
  id: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  status: string;
  site?: string | null;
  registrationOpenAt: string;
  registrationCloseAt: string;
  resaleAt?: string | null;
  pickupStartAt?: string | null;
  pickupEndAt?: string | null;
  cooldownMonths: number;
  eligibilityMode: string;
  maxRegistrations: number;
  allowCancellation: boolean;
  autoPublishResults: boolean;
  openOnPublish?: boolean;
  termsVersion: string;
  models?: ResaleLaptopModel[];
  forms?: UploadedForm[];
  totalLaptops?: number;
  modelCount?: number;
  myRegistration?:
    | {
        id: string;
        status: string;
        selectedLaptopModelId?: string | null;
        selectedLaptopModelIds?: string[];
        handoverAccepted?: boolean;
      }
    | Registration
    | null;
  _count?: { registrations: number };
}

export interface Registration {
  id: string;
  resaleId: string;
  userId: string;
  selectedLaptopModelId?: string | null;
  selectedLaptopModelIds?: string[];
  multiChoiceAck?: boolean;
  modelChoices?: { laptopModelId: string }[];
  status: string;
  eligibilityStatus: string;
  eligibilityReason?: string | null;
  eligibilityOverride: boolean;
  overrideReason?: string | null;
  termsAccepted: boolean;
  typedFullName?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  user?: User;
  resale?: Resale;
  selectedModel?: LaptopModel | null;
  selectedModels?: LaptopModel[];
  handover?: HandoverRecord | null;
  results?: ResaleResult[];
  declarations?: RegistrationDeclaration[];
}

export interface RegistrationDeclaration {
  id: string;
  declarationKey: string;
  declarationText: string;
  declarationVersion: string;
  accepted: boolean;
  acceptedAt?: string | null;
}

export interface ResaleResult {
  id: string;
  resaleId: string;
  registrationId: string;
  laptopModelId: string;
  resultType: string;
  resultOrder: number;
  publishedAt?: string | null;
  registration?: Registration & { user: User };
  laptopModel?: LaptopModel;
  assignment?: WinnerAssignment | null;
}

export interface WinnerAssignment {
  id: string;
  resaleResultId: string;
  status: string;
  respondedAt?: string | null;
  replacementFromResultId?: string | null;
}

export interface HandoverRecord {
  id: string;
  registrationId: string;
  userId: string;
  resaleId: string;
  laptopModelId: string;
  serialNumber?: string | null;
  assetNumber?: string | null;
  price?: number | null;
  pickupLocation?: string | null;
  payrollDeductionConfirmed: boolean;
  employeeConfirmation: boolean;
  employeeTypedName?: string | null;
  idNumber?: string | null;
  signatureData?: string | null;
  agreementVersion?: string | null;
  agreementText?: string | null;
  employeeConfirmedAt?: string | null;
  administratorConfirmation: boolean;
  administratorId?: string | null;
  administratorConfirmedAt?: string | null;
  notes?: string | null;
  claimedAt?: string | null;
  completedAt?: string | null;
  declinedAt?: string | null;
  declineReason?: string | null;
  user?: User;
  laptopModel?: LaptopModel;
  administrator?: User | null;
  resale?: Resale;
}

export interface UploadedForm {
  id: string;
  resaleId?: string | null;
  formType: string;
  originalFilename: string;
  version: number;
  isActive: boolean;
  mimeType: string;
  uploadedAt: string;
}

export interface ParticipationHistory {
  id: string;
  userId: string;
  resaleId: string;
  participationDate: string;
  winner: boolean;
  purchaseCompleted: boolean;
  handoverCompletedAt?: string | null;
  nextEligibleAt?: string | null;
  resale?: Resale;
}

export interface ParticipatedResale {
  registrationId: string;
  resaleTitle: string;
  date: string;
  status: string;
  declined: {
    stage: string;
    reason: string | null;
    byName: string | null;
  } | null;
}

export interface EligibilityResult {
  status: 'ELIGIBLE' | 'INELIGIBLE' | 'REVIEW';
  reason: string;
  nextEligibleAt?: string | null;
}

export interface Declaration {
  key: string;
  text: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  createdAt: string;
  role?: string | null;
  user?: User | null;
}

export interface AdminStats {
  activeResales: number;
  draftResales: number;
  scheduledResales: number;
  registrationsOpen: number;
  totalRegistrations: number;
  eligibleRegistrations: number;
  pendingResales: number;
  pendingPublication: number;
  winnersAwaiting: number;
  pendingHandovers: number;
  completedHandovers: number;
  availableInventory: number;
  upcomingClosings: Resale[];
  resaleStatuses: Resale[];
  recentActivity: AuditLog[];
}

export interface PreResaleStats {
  totalRegistrations: number;
  eligibleRegistrations: number;
  ineligibleRegistrations: number;
  excludedRegistrations: number;
  cancelledRegistrations: number;
  models: {
    laptopModelId: string;
    modelName: string;
    quantity: number;
    validRegistrations: number;
    winnersToSelect: number;
  }[];
}
