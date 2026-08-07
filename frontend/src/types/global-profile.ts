export interface GlobalProfile {
  account: {
    id: string;
    email: string;
    phone?: string | null;
    username?: string | null;
    full_name?: string | null;
    profile_photo_url?: string | null;
    profile_headline?: string | null;
    biography?: string | null;
    country?: string | null;
    address?: Record<string, unknown> | null;
    is_active: boolean;
    is_super_admin: boolean;
    is_internal_staff: boolean;
    internal_role?: string | null;
    status?: string | null;
    employee_id?: string | null;
    mfa_enabled: boolean;
    created_at?: string;
    updated_at?: string;
    last_login_at?: string | null;
  };
  employee: any | null;
  organization: any | null;
  branches: Array<{ id: string; name: string; code?: string | null; status?: string | null; role?: string | null }>;
  roleContext: {
    primaryRole: string;
    platformRole?: string | null;
    tenantRole?: string | null;
    isPlatformUser: boolean;
    isOrgUser: boolean;
    isEmployeeLinked: boolean;
    isManager: boolean;
    branchScoped: boolean;
  };
  permissions: string[];
  accessScope: any;
  completion: {
    percent: number;
    missing: Array<{ key: string; label: string }>;
  };
  preferences: {
    language: string;
    theme: 'light' | 'dark' | 'system';
    timezone: string;
    dateFormat: string;
    timeFormat: string;
    currency: string;
    dashboardLayout: string;
    sidebarCollapsed: boolean;
    defaultLandingPage: string;
  };
  security: {
    mfaEnabled: boolean;
    lastLoginAt?: string | null;
    sessions: Array<{ id: string; device_info?: string | null; ip_address?: string | null; created_at: string; expires_at: string }>;
    trustedDevices: Array<{ id: string; browser_fingerprint?: string | null; ip_address?: string | null; created_at: string; last_used_at?: string | null; expires_at: string }>;
  };
  notifications: Array<{ module: string; in_app: boolean; email: boolean; sms: boolean; whatsapp: boolean }>;
  documents: Array<{ id: string; document_type?: string; name: string; file_url: string; file_size_bytes?: number; mime_type?: string; created_at: string }>;
  activity: Array<{ id: string; action: string; entity_type?: string; ip_address?: string | null; user_agent?: string | null; created_at: string }>;
  changeRequests: {
    approvalRequiredFields: string[];
  };
}

export interface GlobalProfilePersonalPayload {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  preferredName?: string;
  gender?: string;
  phone?: string;
  alternatePhone?: string;
  personalEmail?: string;
  language?: string;
  timezone?: string;
  country?: string;
  address?: Record<string, unknown>;
  biography?: string;
  headline?: string;
}
