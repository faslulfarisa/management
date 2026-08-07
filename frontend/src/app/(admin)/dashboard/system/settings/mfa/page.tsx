'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { OtpInput } from '@/components/auth/otp-input';
import {
  ShieldCheck, ShieldOff, KeyRound, Smartphone, Download, Printer, Trash2,
  Loader2, CheckCircle2, Copy, History,
} from 'lucide-react';

type Step = null | 'password-for-setup' | 'setup-qr' | 'recovery-reveal' | 'disable' | 'password-for-regenerate' | 'revoke-device';

interface MfaStatus {
  mfaEnabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
  trustedDeviceCount: number;
}

interface TrustedDevice {
  id: string;
  browser_fingerprint: string | null;
  ip_address: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
}

interface ActivityEntry {
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  mfa_enabled: 'MFA enabled',
  mfa_disabled: 'MFA disabled',
  mfa_login_success: 'Successful MFA login',
  mfa_login_failed: 'Failed MFA login',
  mfa_login_rate_limited: 'MFA verification temporarily locked (too many failures)',
  mfa_recovery_code_used: 'Recovery code used',
  mfa_trusted_device_added: 'Trusted device added',
  mfa_trusted_device_removed: 'Trusted device removed',
};

function downloadRecoveryCodes(codes: string[]) {
  const blob = new Blob(
    [`Ai-HRMS Recovery Codes\nGenerated: ${new Date().toLocaleString()}\n\n${codes.join('\n')}\n\nEach code may only be used once. Store them somewhere safe.`],
    { type: 'text/plain' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ai-hrms-recovery-codes.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function printRecoveryCodes(codes: string[]) {
  const win = window.open('', '_blank', 'width=480,height=640');
  if (!win) return;
  win.document.write(`<html><head><title>Ai-HRMS Recovery Codes</title>
    <style>body{font-family:monospace;padding:32px;color:#111} h1{font-size:16px} ul{list-style:none;padding:0} li{font-size:18px;padding:6px 0;letter-spacing:2px}</style>
  </head><body><h1>Ai-HRMS — Recovery Codes</h1><ul>${codes.map((c) => `<li>${c}</li>`).join('')}</ul><p>Each code may only be used once.</p></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

export default function MfaPage() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>(null);
  const [password, setPassword] = useState('');
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [revealedCodes, setRevealedCodes] = useState<string[]>([]);
  const [deviceToRevoke, setDeviceToRevoke] = useState<TrustedDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [copied, setCopied] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [statusRes, devicesRes, activityRes] = await Promise.all([
        api.get('/auth/mfa/status'),
        api.get('/auth/mfa/trusted-devices'),
        api.get('/auth/mfa/activity'),
      ]);
      setStatus(statusRes.data.data);
      setDevices(devicesRes.data.data);
      setActivity(activityRes.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const closeDialog = () => {
    setStep(null);
    setPassword('');
    setOtp('');
    setDisableToken('');
    setDialogError('');
    setSetupData(null);
    setDeviceToRevoke(null);
  };

  const dialogErrorMessage = (err: any, fallback: string) =>
    err.response?.data?.error?.message ?? err.response?.data?.message ?? fallback;

  // ── Enable flow: password confirm → QR/secret → verify → recovery codes ──
  const submitPasswordForSetup = async () => {
    setBusy(true);
    setDialogError('');
    try {
      const { data } = await api.post('/auth/mfa/setup', { password });
      setSetupData(data.data);
      setStep('setup-qr');
      setPassword('');
    } catch (err: any) {
      setDialogError(dialogErrorMessage(err, 'Incorrect password'));
    } finally {
      setBusy(false);
    }
  };

  const submitVerifySetup = async () => {
    setBusy(true);
    setDialogError('');
    try {
      const { data } = await api.post('/auth/mfa/verify', { token: otp });
      setRevealedCodes(data.data.recoveryCodes);
      setOtp('');
      setStep('recovery-reveal');
      loadAll();
    } catch (err: any) {
      setDialogError(dialogErrorMessage(err, 'Invalid code'));
    } finally {
      setBusy(false);
    }
  };

  // ── Disable flow ──
  const submitDisable = async () => {
    setBusy(true);
    setDialogError('');
    try {
      await api.post('/auth/mfa/disable', { token: disableToken });
      closeDialog();
      loadAll();
    } catch (err: any) {
      setDialogError(dialogErrorMessage(err, 'Invalid code'));
    } finally {
      setBusy(false);
    }
  };

  // ── Regenerate recovery codes flow: password confirm → reveal ──
  const submitPasswordForRegenerate = async () => {
    setBusy(true);
    setDialogError('');
    try {
      const { data } = await api.post('/auth/mfa/recovery-codes/regenerate', { password });
      setRevealedCodes(data.data.recoveryCodes);
      setPassword('');
      setStep('recovery-reveal');
      loadAll();
    } catch (err: any) {
      setDialogError(dialogErrorMessage(err, 'Incorrect password'));
    } finally {
      setBusy(false);
    }
  };

  // ── Revoke trusted device ──
  const submitRevokeDevice = async () => {
    if (!deviceToRevoke) return;
    setBusy(true);
    setDialogError('');
    try {
      await api.delete(`/auth/mfa/trusted-devices/${deviceToRevoke.id}`);
      closeDialog();
      loadAll();
    } catch (err: any) {
      setDialogError(dialogErrorMessage(err, 'Failed to revoke device'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security</h1>
        <p className="text-muted-foreground">Multi-Factor Authentication</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Status</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg ${status?.mfaEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                {status?.mfaEnabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-medium">{status?.mfaEnabled ? 'Enabled' : 'Disabled'}</p>
                <p className="text-sm text-muted-foreground">
                  {status?.mfaEnabled
                    ? `Enabled on ${status.enabledAt ? new Date(status.enabledAt).toLocaleString() : '—'}`
                    : 'Add an extra layer of security to your account with an authenticator app.'}
                </p>
              </div>
            </div>
            {status?.mfaEnabled ? (
              <Button variant="destructive" onClick={() => setStep('disable')}>Disable</Button>
            ) : (
              <Button onClick={() => setStep('password-for-setup')}>Enable</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {status?.mfaEnabled && (
        <>
          <Card>
            <CardHeader><CardTitle>Recovery Codes</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{status.recoveryCodesRemaining} of 10 remaining</p>
                  <p className="text-sm text-muted-foreground">Use a recovery code to sign in if you lose access to your authenticator app.</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => setStep('password-for-regenerate')}>Regenerate</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Trusted Devices ({devices.length})</CardTitle></CardHeader>
            <CardContent>
              {devices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No trusted devices. Check "Trust this device" at login to skip MFA on this browser for 30 days.
                </p>
              ) : (
                <div className="space-y-3">
                  {devices.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{d.browser_fingerprint || 'Unknown device'}</p>
                          <p className="text-xs text-muted-foreground">
                            Added {new Date(d.created_at).toLocaleDateString()} · Expires {new Date(d.expires_at).toLocaleDateString()}
                            {d.ip_address ? ` · ${d.ip_address}` : ''}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setDeviceToRevoke(d); setStep('revoke-device'); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent MFA Activity</CardTitle></CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No activity yet.</p>
              ) : (
                <div className="space-y-2">
                  {activity.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border-b border-border last:border-0 py-2">
                      <span className="flex items-center gap-2">
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        {ACTIVITY_LABELS[a.action] || a.action}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}{a.ip_address ? ` · ${a.ip_address}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Password confirm — setup */}
      <Dialog open={step === 'password-for-setup'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm your password</DialogTitle>
            <DialogDescription>Re-enter your password to set up multi-factor authentication.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && password && submitPasswordForSetup()}
            />
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy}>Cancel</Button>
            <Button onClick={submitPasswordForSetup} disabled={busy || !password}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Setup — QR + verify */}
      <Dialog open={step === 'setup-qr'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set up your authenticator app</DialogTitle>
            <DialogDescription>
              Scan the QR code with Google Authenticator, Microsoft Authenticator, Authy, 1Password, Bitwarden, or Duo Mobile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {setupData?.qrCode && (
              <div className="bg-white p-4 inline-block rounded-lg border border-border">
                <img src={setupData.qrCode} alt="MFA QR Code" className="w-48 h-48" />
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Can't scan? Enter this code manually:</p>
              <code className="bg-muted px-3 py-1.5 rounded text-sm font-mono block break-all">{setupData?.secret}</code>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Enter the 6-digit code from your app:</p>
              <OtpInput value={otp} onChange={setOtp} disabled={busy} />
            </div>
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy}>Cancel</Button>
            <Button onClick={submitVerifySetup} disabled={busy || otp.length !== 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Enable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recovery codes reveal — shared by setup + regenerate */}
      <Dialog open={step === 'recovery-reveal'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Save your recovery codes
            </DialogTitle>
            <DialogDescription>
              Each code can be used once if you lose access to your authenticator app. This is the only time they'll be shown in full.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted p-4 font-mono text-sm">
            {revealedCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadRecoveryCodes(revealedCodes)}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download
            </Button>
            <Button variant="outline" size="sm" onClick={() => printRecoveryCodes(revealedCodes)}>
              <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(revealedCodes.join('\n'));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" /> {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={closeDialog}>I've saved my codes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable */}
      <Dialog open={step === 'disable'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Disable multi-factor authentication</DialogTitle>
            <DialogDescription>Enter the current code from your authenticator app to confirm.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <OtpInput value={disableToken} onChange={setDisableToken} disabled={busy} />
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={submitDisable} disabled={busy || disableToken.length !== 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable MFA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password confirm — regenerate recovery codes */}
      <Dialog open={step === 'password-for-regenerate'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm your password</DialogTitle>
            <DialogDescription>Regenerating recovery codes immediately invalidates all existing codes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="Current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && password && submitPasswordForRegenerate()}
            />
            {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy}>Cancel</Button>
            <Button onClick={submitPasswordForRegenerate} disabled={busy || !password}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Regenerate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke trusted device */}
      <Dialog open={step === 'revoke-device'} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke trusted device</DialogTitle>
            <DialogDescription>
              {deviceToRevoke?.browser_fingerprint || 'This device'} will be asked for an MFA code the next time it signs in.
            </DialogDescription>
          </DialogHeader>
          {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={submitRevokeDevice} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
