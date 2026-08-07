'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileText,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Save,
  Shield,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import PhoneNumberInput from '@/components/forms/PhoneNumberInput';
import AddressFields, { type AddressValue } from '@/components/forms/AddressFields';
import { cn } from '@/lib/utils';
import { clearTenantScopedStorage } from '@/lib/org-switch';
import { getPostLogoutRedirectPath } from '@/lib/auth/logout-redirect';
import { globalProfileApi } from '@/lib/global-profile-api';
import { useAuthStore } from '@/store/auth.store';
import type { GlobalProfile } from '@/types/global-profile';

type TabKey = 'overview' | 'personal' | 'settings' | 'security' | 'notifications' | 'documents' | 'activity';

const tabs: Array<{ key: TabKey; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'overview', label: 'Overview', Icon: User },
  { key: 'personal', label: 'Personal', Icon: Mail },
  { key: 'settings', label: 'Settings', Icon: LayoutDashboard },
  { key: 'security', label: 'Security', Icon: Shield },
  { key: 'notifications', label: 'Notifications', Icon: Bell },
  { key: 'documents', label: 'Documents', Icon: FileText },
  { key: 'activity', label: 'Activity', Icon: CalendarClock },
];

export function GlobalProfilePage() {
  const router = useRouter();
  const { accessToken, _hydrated, logout } = useAuthStore();
  const [profile, setProfile] = useState<GlobalProfile | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!_hydrated) return;
    if (!accessToken) {
      router.push('/login');
      return;
    }
    let alive = true;
    setLoading(true);
    globalProfileApi.getProfile()
      .then((data) => {
        if (alive) setProfile(data);
      })
      .catch(() => {
        if (alive) setError('Unable to load your profile right now.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [_hydrated, accessToken, router]);

  const displayName = useMemo(() => getDisplayName(profile), [profile]);
  const initials = useMemo(() => displayName.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'U', [displayName]);

  if (!_hydrated || loading) {
    return <LoadingState />;
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Profile unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error || 'Your profile could not be loaded.'}</p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleLogout = () => {
    const redirectPath = getPostLogoutRedirectPath();
    clearTenantScopedStorage();
    logout();
    window.location.href = redirectPath;
  };

  const updateProfile = async (next: Promise<GlobalProfile>) => {
    setSaving(true);
    setError(null);
    try {
      setProfile(await next);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3 md:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-950">Profile and Settings</h1>
            <p className="text-xs text-slate-500">Global account profile for every authenticated HRMS user</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      <main className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 md:py-6">
        {error ? <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-4">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-2xl font-semibold text-white">
                  {profile.account.profile_photo_url || profile.employee?.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.account.profile_photo_url || profile.employee?.photo_url} alt="" className="h-full w-full rounded-lg object-cover" />
                  ) : initials}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold text-slate-950">{displayName}</h2>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                    <Badge>{labelize(profile.roleContext.primaryRole)}</Badge>
                    <Badge>{profile.account.status || (profile.account.is_active ? 'Active' : 'Inactive')}</Badge>
                    {profile.organization?.name ? <Badge>{profile.organization.name}</Badge> : null}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                    <InfoLine label="Username" value={profile.account.username || '-'} />
                    <InfoLine label="Email" value={profile.account.email} />
                    <InfoLine label="Branch" value={profile.employee?.branch_name || branchSummary(profile)} />
                    <InfoLine label="Department" value={profile.employee?.department_name} />
                    <InfoLine label="Designation" value={profile.employee?.designation_name || profile.employee?.position_name} />
                    <InfoLine label="Employee Code" value={profile.employee?.employee_code} />
                    <InfoLine label="Platform Role" value={profile.roleContext.platformRole ? labelize(profile.roleContext.platformRole) : undefined} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <QuickButton icon={User} label="Edit Profile" onClick={() => setActiveTab('personal')} />
                <QuickButton icon={KeyRound} label="Password" href="/change-password" />
                <QuickButton icon={Camera} label="Photo" onClick={() => setActiveTab('personal')} />
                <QuickButton icon={Bell} label="Notifications" onClick={() => setActiveTab('notifications')} />
              </div>
            </div>
          </div>

          <CompletionCard profile={profile} />
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 lg:block lg:space-y-1">
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  'flex min-w-max items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors lg:w-full',
                  activeTab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <div className="min-w-0">
            {activeTab === 'overview' && <OverviewTab profile={profile} />}
            {activeTab === 'personal' && (
              <PersonalTab
                profile={profile}
                saving={saving}
                onSave={(payload) => updateProfile(globalProfileApi.updatePersonal(payload))}
                onUploadPhoto={(file) => updateProfile(globalProfileApi.uploadPhoto(file))}
                onDeletePhoto={() => updateProfile(globalProfileApi.deletePhoto())}
              />
            )}
            {activeTab === 'settings' && <SettingsTab profile={profile} saving={saving} onSave={(payload) => updateProfile(globalProfileApi.updateAccount(payload))} />}
            {activeTab === 'security' && <SecurityTab profile={profile} onSessionRevoked={(id) => updateProfile(globalProfileApi.revokeSession(id).then(() => globalProfileApi.getProfile()))} />}
            {activeTab === 'notifications' && <NotificationsTab profile={profile} />}
            {activeTab === 'documents' && <DocumentsTab profile={profile} />}
            {activeTab === 'activity' && <ActivityTab profile={profile} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function OverviewTab({ profile }: { profile: GlobalProfile }) {
  const sections = roleSections(profile);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Role Workspace</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {sections.map((section) => (
            <div key={section.title} className="rounded-md border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{section.title}</h3>
                <section.Icon className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-2 text-sm text-slate-500">{section.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {section.items.map((item) => <Badge key={item}>{item}</Badge>)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoLine label="Organization" value={profile.organization?.name || 'Platform'} />
          <InfoLine label="Role" value={labelize(profile.roleContext.primaryRole)} />
          <InfoLine label="MFA" value={profile.security.mfaEnabled ? 'Enabled' : 'Not enabled'} />
          <InfoLine label="Last Login" value={formatDate(profile.account.last_login_at)} />
          <InfoLine label="Active Sessions" value={String(profile.security.sessions.length)} />
        </CardContent>
      </Card>
    </div>
  );
}

function PersonalTab({
  profile,
  saving,
  onSave,
  onUploadPhoto,
  onDeletePhoto,
}: {
  profile: GlobalProfile;
  saving: boolean;
  onSave: (payload: any) => void;
  onUploadPhoto: (file: File) => void;
  onDeletePhoto: () => void;
}) {
  const [form, setForm] = useState(() => ({
    firstName: profile.employee?.first_name || firstName(profile.account.full_name),
    middleName: profile.employee?.middle_name || '',
    lastName: profile.employee?.last_name || lastName(profile.account.full_name),
    preferredName: profile.employee?.nickname || '',
    gender: profile.employee?.gender || '',
    phone: profile.account.phone || profile.employee?.personal_phone || '',
    alternatePhone: profile.employee?.alternate_phone || '',
    personalEmail: profile.employee?.personal_email || profile.account.email || '',
    language: profile.preferences.language || 'en',
    timezone: profile.preferences.timezone || '',
    country: profile.employee?.country || profile.account.country || '',
    headline: profile.account.profile_headline || '',
    biography: profile.account.biography || '',
    address: normalizeAddress(profile.employee?.present_address || profile.account.address),
  }));

  return (
    <div className="space-y-4">
      <PhotoCard profile={profile} saving={saving} onUpload={onUploadPhoto} onDelete={onDeletePhoto} />

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <TextField label="First Name" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
            <TextField label="Middle Name" value={form.middleName} onChange={(middleName) => setForm({ ...form, middleName })} />
            <TextField label="Last Name" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
            <TextField label="Preferred Name" value={form.preferredName} onChange={(preferredName) => setForm({ ...form, preferredName })} />
            <TextField label="Gender" value={form.gender} onChange={(gender) => setForm({ ...form, gender })} />
            <TextField label="Country" value={form.country} onChange={(country) => setForm({ ...form, country })} />
            <div>
              <Label>Phone</Label>
              <PhoneNumberInput value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
            </div>
            <div>
              <Label>Alternate Phone</Label>
              <PhoneNumberInput value={form.alternatePhone} onChange={(alternatePhone) => setForm({ ...form, alternatePhone })} />
            </div>
            <TextField label="Personal Email" value={form.personalEmail} onChange={(personalEmail) => setForm({ ...form, personalEmail })} />
            <TextField label="Language" value={form.language} onChange={(language) => setForm({ ...form, language })} />
            <TextField label="Time Zone" value={form.timezone} onChange={(timezone) => setForm({ ...form, timezone })} />
            <TextField label="Profile Headline" value={form.headline} onChange={(headline) => setForm({ ...form, headline })} />
          </div>
          <div>
            <Label>Address</Label>
            <AddressFields value={form.address} onChange={(address) => setForm({ ...form, address })} />
          </div>
          <div>
            <Label>Biography</Label>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.biography}
              onChange={(event) => setForm({ ...form, biography: event.target.value })}
            />
          </div>
          <Button onClick={() => onSave(form)} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Personal Info'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PhotoCard({
  profile,
  saving,
  onUpload,
  onDelete,
}: {
  profile: GlobalProfile;
  saving: boolean;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photoUrl = profile.account.profile_photo_url || profile.employee?.photo_url;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Photo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-lg font-semibold text-white">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : getDisplayName(profile).slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-900">Avatar</p>
            <p className="text-xs text-slate-500">PNG, JPG, WEBP, or SVG up to 5 MB</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = '';
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => inputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
          {photoUrl ? (
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsTab({ profile, saving, onSave }: { profile: GlobalProfile; saving: boolean; onSave: (payload: { username?: string; email?: string }) => void }) {
  const [account, setAccount] = useState({ username: profile.account.username || '', email: profile.account.email || '' });
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextField label="Username" value={account.username} onChange={(username) => setAccount({ ...account, username })} />
          <TextField label="Email" value={account.email} onChange={(email) => setAccount({ ...account, email })} />
          <Button onClick={() => onSave(account)} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Account'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <ReadonlySetting label="Theme" value={labelize(profile.preferences.theme)} icon={profile.preferences.theme === 'dark' ? Moon : Sun} />
          <ReadonlySetting label="Language" value={profile.preferences.language} icon={User} />
          <ReadonlySetting label="Time Zone" value={profile.preferences.timezone} icon={CalendarClock} />
          <ReadonlySetting label="Date Format" value={profile.preferences.dateFormat} icon={CalendarClock} />
          <ReadonlySetting label="Time Format" value={profile.preferences.timeFormat} icon={CalendarClock} />
          <ReadonlySetting label="Currency" value={profile.preferences.currency} icon={LayoutDashboard} />
          <ReadonlySetting label="Default Landing Page" value={profile.preferences.defaultLandingPage} icon={ChevronRight} />
          <ReadonlySetting label="Sidebar" value={profile.preferences.sidebarCollapsed ? 'Collapsed' : 'Expanded'} icon={LayoutDashboard} />
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityTab({ profile, onSessionRevoked }: { profile: GlobalProfile; onSessionRevoked: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <ReadonlySetting label="Two Factor Authentication" value={profile.security.mfaEnabled ? 'Enabled' : 'Not enabled'} icon={Lock} />
          <ReadonlySetting label="Recovery Options" value="Recovery codes available with MFA" icon={KeyRound} />
          <ReadonlySetting label="Security Questions" value="Managed by organization policy" icon={Shield} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.security.sessions.length === 0 ? <EmptyText>No active sessions found.</EmptyText> : null}
          {profile.security.sessions.map((session) => (
            <div key={session.id} className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-3">
                <Laptop className="mt-1 h-5 w-5 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{session.device_info || 'Unknown device'}</p>
                  <p className="text-xs text-slate-500">{session.ip_address || 'Unknown IP'} - expires {formatDate(session.expires_at)}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onSessionRevoked(session.id)}>Terminate</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Remembered Devices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile.security.trustedDevices.length === 0 ? <EmptyText>No remembered devices.</EmptyText> : null}
          {profile.security.trustedDevices.map((device) => (
            <div key={device.id} className="flex gap-3 rounded-md border border-slate-200 p-3">
              <Smartphone className="mt-1 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900">{device.browser_fingerprint || 'Trusted device'}</p>
                <p className="text-xs text-slate-500">{device.ip_address || 'Unknown IP'} - last used {formatDate(device.last_used_at)}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab({ profile }: { profile: GlobalProfile }) {
  const channels = ['in_app', 'email', 'sms', 'whatsapp'] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.notifications.map((item) => (
          <div key={item.module} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[180px_1fr] md:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-900">{labelize(item.module)} Alerts</p>
              <p className="text-xs text-slate-500">Push, email, SMS, and WhatsApp channels</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {channels.map((channel) => (
                <label key={channel} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" checked={!!item[channel]} readOnly className="h-4 w-4" />
                  {labelize(channel)}
                </label>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DocumentsTab({ profile }: { profile: GlobalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.documents.length === 0 ? <EmptyText>No documents are linked to this profile yet.</EmptyText> : null}
        {profile.documents.map((document) => (
          <div key={document.id} className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <FileText className="mt-1 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-sm font-medium text-slate-900">{document.name}</p>
                <p className="text-xs text-slate-500">{labelize(document.document_type || 'document')} - uploaded {formatDate(document.created_at)}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {document.file_url ? <Button asChild variant="outline" size="sm"><Link href={document.file_url}>Preview</Link></Button> : null}
              {document.file_url ? <Button asChild variant="outline" size="sm"><Link href={document.file_url}>Download</Link></Button> : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ActivityTab({ profile }: { profile: GlobalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profile.activity.length === 0 ? <EmptyText>No recent profile activity.</EmptyText> : null}
        {profile.activity.map((item) => (
          <div key={item.id} className="flex gap-3 rounded-md border border-slate-200 p-3">
            <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-slate-900">{labelize(item.action)}</p>
              <p className="text-xs text-slate-500">{labelize(item.entity_type || 'account')} - {formatDate(item.created_at)} - {item.ip_address || 'Unknown IP'}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CompletionCard({ profile }: { profile: GlobalProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Completion</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <span className="text-4xl font-semibold text-slate-950">{profile.completion.percent}%</span>
          <span className="text-xs font-medium text-slate-500">{profile.completion.missing.length} missing</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${profile.completion.percent}%` }} />
        </div>
        <div className="mt-4 space-y-2">
          {profile.completion.missing.length === 0 ? <p className="text-sm text-slate-600">Your profile has the essentials filled in.</p> : null}
          {profile.completion.missing.map((item) => (
            <div key={item.key} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function roleSections(profile: GlobalProfile) {
  const role = profile.roleContext.primaryRole;
  const common = [{ title: 'Own Profile', description: 'Profile, preferences, sessions, and security are available from this shared module.', items: ['Profile', 'Settings', 'Security'], Icon: User }];
  if (role === 'platform_super_admin') return [...common, { title: 'Platform Super Admin', description: 'Platform permissions, managed organizations, subscription control, and system access.', items: ['Permissions', 'Organizations', 'Subscriptions', 'System Access'], Icon: Shield }];
  if (role?.includes('support')) return [...common, { title: 'Support', description: 'Support tickets, assigned organizations, and customer access context.', items: ['Tickets', 'Organizations', 'Tasks'], Icon: Users }];
  if (role?.includes('sales')) return [...common, { title: 'Sales', description: 'Lead ownership, assigned organizations, and revenue context.', items: ['Leads', 'Organizations', 'Revenue'], Icon: LayoutDashboard }];
  if (role === 'org_admin') return [...common, { title: 'Organization Admin', description: 'Organization profile, subscription, branch summary, and users.', items: ['Organization', 'Subscription', 'Branches', 'Users'], Icon: LayoutDashboard }];
  if (role === 'branch_admin' || role === 'admin') return [...common, { title: 'Branch Admin', description: 'Managed branches, team members, and attendance summary.', items: ['Branches', 'Team', 'Attendance'], Icon: MapPin }];
  if (role === 'hr') return [...common, { title: 'HR', description: 'Recruitment, employees, approvals, and HR documents.', items: ['Recruitment', 'Employees', 'Approvals'], Icon: Users }];
  if (role === 'finance') return [...common, { title: 'Finance', description: 'Payroll, payments, reimbursements, and finance approvals.', items: ['Payroll', 'Payments', 'Approvals'], Icon: LayoutDashboard }];
  if (profile.roleContext.isManager) return [...common, { title: 'Manager', description: 'Reporting team, pending approvals, and team activity.', items: ['Team', 'Approvals', 'Attendance'], Icon: Users }];
  return [...common, { title: 'Employee', description: 'Employment information, leave, attendance, payslips, and documents.', items: ['Employment', 'Leave', 'Attendance', 'Payslips'], Icon: User }];
}

function QuickButton({ icon: Icon, label, href, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; href?: string; onClick?: () => void }) {
  const className = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50';
  if (href) return <Link href={href} className={className}><Icon className="h-4 w-4" />{label}</Link>;
  return <button type="button" onClick={onClick} className={className}><Icon className="h-4 w-4" />{label}</button>;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">{children}</label>;
}

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <p className="truncate text-sm font-medium text-slate-800">{value || '-'}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{children}</span>;
}

function ReadonlySetting({ label, value, icon: Icon }: { label: string; value?: string | null; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-400" />
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value || '-'}</p>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{children}</p>;
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="h-8 w-8 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
    </div>
  );
}

function getDisplayName(profile: GlobalProfile | null) {
  if (!profile) return 'User';
  const employeeName = [profile.employee?.first_name, profile.employee?.middle_name, profile.employee?.last_name].filter(Boolean).join(' ').trim();
  return employeeName || profile.account.full_name || profile.account.username || profile.account.email || 'User';
}

function firstName(fullName?: string | null) {
  return fullName?.split(' ')[0] || '';
}

function lastName(fullName?: string | null) {
  const parts = fullName?.split(' ').filter(Boolean) || [];
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function normalizeAddress(value: any): AddressValue {
  if (!value) return {};
  if (typeof value === 'string') return { text: value, line1: value };
  return value;
}

function branchSummary(profile: GlobalProfile) {
  if (profile.branches.length === 0) return undefined;
  if (profile.branches.length === 1) return profile.branches[0].name;
  return `${profile.branches.length} branches`;
}

function labelize(value?: string | null) {
  if (!value) return '-';
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  try {
    return format(parseISO(value), 'd MMM yyyy, h:mm a');
  } catch {
    return value;
  }
}
