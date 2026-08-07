import api from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CompanyType =
  | 'private_limited'
  | 'public_limited'
  | 'llp'
  | 'partnership'
  | 'sole_proprietorship'
  | 'ngo'
  | 'government'
  | 'other';

export type AssetType =
  | 'logo_rectangular'
  | 'logo_square';

export type DocumentType =
  | 'invoice'
  | 'payslip'
  | 'payroll_export'
  | 'hr_letter'
  | 'offer_letter'
  | 'experience_letter'
  | 'report'
  | 'quotation';

export interface AddressPayload {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
}

export interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  gstin: string | null;
  timezone: string | null;
  currency: string | null;
  date_format: string | null;
  fiscal_year_start: number | null;
  legal_name: string | null;
  trade_name: string | null;
  company_code: string | null;
  registration_number: string | null;
  pan_number: string | null;
  cin_number: string | null;
  company_type: CompanyType | null;
  primary_email: string | null;
  support_email: string | null;
  phone_number: string | null;
  alternate_phone: string | null;
  website_url: string | null;
  registered_address: AddressPayload | null;
  operational_address: AddressPayload | null;
  work_week_config: Record<string, unknown> | null;
  leave_year_config: Record<string, unknown> | null;
  max_failed_login_attempts: number;
  profile_updated_at: string | null;
  profile_updated_by: string | null;
  status: string;
  approval_status: string;
  industry: string | null;
  contact_person_name: string | null;
  contact_designation: string | null;
  contact_person_mobile: string | null;
  contact_person_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateCoreInfoPayload {
  name?: string;
  legalName?: string;
  tradeName?: string;
  companyCode?: string;
  registrationNumber?: string;
  gstin?: string;
  panNumber?: string;
  cinNumber?: string;
  companyType?: CompanyType;
  fiscalYearStart?: number;
}

export interface UpdateContactInfoPayload {
  primaryEmail?: string;
  supportEmail?: string;
  phoneNumber?: string;
  alternatePhone?: string;
  websiteUrl?: string;
  contactPersonName?: string;
  contactDesignation?: string;
  contactPersonMobile?: string;
  contactPersonEmail?: string;
}

export interface UpdateAddressesPayload {
  registeredAddress?: AddressPayload;
  operationalAddress?: AddressPayload;
}

export interface UpdateOperationalConfigPayload {
  timezone?: string;
  currency?: string;
  dateFormat?: string;
  workWeekConfig?: Record<string, unknown>;
  leaveYearConfig?: Record<string, unknown>;
}

export interface UpdateSecurityConfigPayload {
  maxFailedLoginAttempts?: number;
}

export interface BrandingAsset {
  id: string;
  asset_type: AssetType;
  file_url: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentBrandingConfig {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  document_type: DocumentType;
  logo_placement: string;
  watermark_enabled: boolean;
  watermark_text: string | null;
  watermark_opacity: number;
  show_company_seal: boolean;
  footer_text: string | null;
  header_color: string | null;
  accent_color: string | null;
  show_gstin: boolean;
  show_address: boolean;
  custom_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertDocumentBrandingPayload {
  documentType: DocumentType;
  branchId?: string;
  logoPlacement?: string;
  watermarkEnabled?: boolean;
  watermarkText?: string;
  watermarkOpacity?: number;
  showCompanySeal?: boolean;
  footerText?: string;
  headerColor?: string;
  accentColor?: string;
  showGstin?: boolean;
  showAddress?: boolean;
  customConfig?: Record<string, unknown>;
}

export interface BankAccount {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  account_label: string | null;
  account_holder_name: string | null;
  bank_name: string | null;
  ifsc_code: string | null;
  account_type: string | null;
  upi_id: string | null;
  is_primary: boolean;
  use_for_invoices: boolean;
  use_for_payroll: boolean;
  account_last4: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBankAccountPayload {
  accountLabel?: string;
  accountHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountType?: string;
  upiId?: string;
  branchId?: string;
  isPrimary?: boolean;
  useForInvoices?: boolean;
  useForPayroll?: boolean;
}

export type UpdateBankAccountPayload = Omit<CreateBankAccountPayload, 'branchId'>;

// ── Profile ───────────────────────────────────────────────────────────────────

export const profileApi = {
  get: (): Promise<OrganizationProfile> =>
    api.get('/organization/profile').then((r) => r.data.data),

  updateCore: (data: UpdateCoreInfoPayload): Promise<OrganizationProfile> =>
    api.patch('/organization/profile/core', data).then((r) => r.data.data),

  updateContact: (data: UpdateContactInfoPayload): Promise<OrganizationProfile> =>
    api.patch('/organization/profile/contact', data).then((r) => r.data.data),

  updateAddresses: (data: UpdateAddressesPayload): Promise<OrganizationProfile> =>
    api.patch('/organization/profile/addresses', data).then((r) => r.data.data),

  updateOperations: (data: UpdateOperationalConfigPayload): Promise<OrganizationProfile> =>
    api.patch('/organization/profile/operations', data).then((r) => r.data.data),

  updateSecurity: (data: UpdateSecurityConfigPayload): Promise<OrganizationProfile> =>
    api.patch('/organization/profile/security', data).then((r) => r.data.data),
};

// ── Branding Assets ───────────────────────────────────────────────────────────

export const brandingAssetsApi = {
  list: (): Promise<Record<AssetType, BrandingAsset>> =>
    api.get('/organization/profile/branding/assets').then((r) => r.data.data),

  upload: (assetType: AssetType, file: File): Promise<BrandingAsset> => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post(`/organization/profile/branding/assets/${assetType}`, formData)
      .then((r) => r.data.data);
  },

  remove: (id: string): Promise<void> =>
    api.delete(`/organization/profile/branding/assets/${id}`).then(() => undefined),
};

// ── Document Branding ─────────────────────────────────────────────────────────

export const documentBrandingApi = {
  list: (): Promise<DocumentBrandingConfig[]> =>
    api.get('/organization/profile/branding/documents').then((r) => r.data.data),

  upsert: (data: UpsertDocumentBrandingPayload): Promise<DocumentBrandingConfig> =>
    api.put('/organization/profile/branding/documents', data).then((r) => r.data.data),
};

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export const bankAccountsApi = {
  list: (): Promise<BankAccount[]> =>
    api.get('/organization/profile/bank-accounts').then((r) => r.data.data),

  create: (data: CreateBankAccountPayload): Promise<BankAccount> =>
    api.post('/organization/profile/bank-accounts', data).then((r) => r.data.data),

  update: (id: string, data: UpdateBankAccountPayload): Promise<BankAccount> =>
    api.patch(`/organization/profile/bank-accounts/${id}`, data).then((r) => r.data.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/organization/profile/bank-accounts/${id}`).then(() => undefined),
};

// ── Flat export for convenience ───────────────────────────────────────────────

export const companyProfileApi = {
  getProfile: profileApi.get,
  updateCoreInfo: profileApi.updateCore,
  updateContactInfo: profileApi.updateContact,
  updateAddresses: profileApi.updateAddresses,
  updateOperationalConfig: profileApi.updateOperations,
  updateSecurityConfig: profileApi.updateSecurity,

  getBrandingAssets: brandingAssetsApi.list,
  uploadBrandingAsset: brandingAssetsApi.upload,
  deleteBrandingAsset: brandingAssetsApi.remove,

  getDocumentBrandingConfigs: documentBrandingApi.list,
  upsertDocumentBrandingConfig: documentBrandingApi.upsert,

  getBankAccounts: bankAccountsApi.list,
  createBankAccount: bankAccountsApi.create,
  updateBankAccount: bankAccountsApi.update,
  deleteBankAccount: bankAccountsApi.remove,
};
