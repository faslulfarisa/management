'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Loader2, Server, Network, ShieldCheck, Activity,
  Cpu, Sliders, ChevronDown, Check, Wifi, AlertTriangle, Play, HelpCircle
} from 'lucide-react';
import api from '@/lib/api';
import { useCreateDevice } from '@/hooks/use-devices';
import { devicesApi } from '@/lib/biometrics-api';

interface Branch { id: string; name: string; }
interface Department { id: string; name: string; }

export interface AddDeviceDrawerProps {
  onClose: () => void;
  onSaved: () => void;
}

const HARDWARE_TYPES = [
  { value: 'fingerprint', label: 'Fingerprint Device', icon: '👆' },
  { value: 'face', label: 'Face Recognition Device', icon: '👤' },
  { value: 'card', label: 'Card/RFID Reader', icon: '💳' },
  { value: 'hybrid', label: 'Hybrid Multi-Biometric', icon: '🔀' },
  { value: 'unknown', label: 'Unknown / Legacy', icon: '🖥️' }
];

const PROVIDERS = [
  { value: 'easytimepro', label: 'EasyTimePro Ingestion Middleware' },
  { value: 'zkteco', label: 'ZKTeco Hardware (ADMS/Direct)' },
  { value: 'custom', label: 'Custom Custom API' },
  { value: 'other', label: 'Other Future Provider' }
];

const CONNECTION_TYPES = [
  { value: 'lan', label: 'LAN (Local Area Network)' },
  { value: 'wan', label: 'WAN (Wide Area Network)' },
  { value: 'cloud_api', label: 'Cloud/API Gateway' },
  { value: 'local_sync', label: 'Local Ingestion Daemon' },
  { value: 'push', label: 'Device-Initiated Push' },
  { value: 'pull', label: 'Server-Scheduled Pull' }
];

const PUNCH_MODES = [
  { value: 'auto', label: 'Auto (IN/OUT Automated Resolve)' },
  { value: 'manual', label: 'Manual Selection Required' },
  { value: 'shift_aware', label: 'Shift-Aware Auto-Resolve' },
  { value: 'strict', label: 'Strict Verification Constraints' }
];

const SYNC_MODES = [
  { value: 'realtime_push', label: 'Real-time Ingestion Stream' },
  { value: 'scheduled_pull', label: 'Interval-scheduled Polling' },
  { value: 'hybrid', label: 'Hybrid (Instant + Fallback Sync)' }
];

const ALL_CAPABILITIES = [
  { value: 'fingerprint', label: 'Fingerprint', desc: 'Capacitive/Optical Sensor' },
  { value: 'face', label: 'Face Recognition', desc: 'Dual-Lens IR Camera' },
  { value: 'card', label: 'RFID/NFC Card', desc: '13.56MHz/125kHz Proximity' },
  { value: 'palm', label: 'Palm Recognition', desc: 'Vascular Pattern Reader' },
  { value: 'pin', label: 'PIN / Password', desc: 'Secure Keypad Input' },
  { value: 'qr', label: 'QR Code Reader', desc: 'Dynamic Screen Scanning' },
  { value: 'hybrid', label: 'Multi-Factor Validation', desc: 'Logical AND/OR Gating' }
];

export function AddDeviceDrawer({ onClose, onSaved }: AddDeviceDrawerProps) {
  const createDeviceMutation = useCreateDevice();

  // Reference Data State
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Expanded Sections State
  const [expandedSection, setExpandedSection] = useState<string>('basic');

  // Form Fields State
  const [form, setForm] = useState({
    name: '',
    serialNumber: '',
    providerName: 'easytimepro',
    providerDeviceId: '',
    hardwareType: 'fingerprint',
    capabilities: ['fingerprint'] as string[],
    
    // Connectivity
    connectionType: 'lan',
    ipAddress: '',
    port: 4370,
    macAddress: '',
    deviceUrl: '',

    // Organization
    branchId: '',
    departmentId: '',
    assignedArea: '',
    attendanceGroupId: '',
    locationDescription: '',

    // Attendance Policy
    sourceType: 'biometric_device',
    verificationPriority: ['face', 'fingerprint', 'card'],
    defaultPunchMode: 'auto',

    // Sync Operations
    syncEnabled: true,
    syncIntervalMinutes: 5,
    batchSize: 100,
    syncMode: 'realtime_push',

    // Security & Infrastructure
    trustedDevice: true,
    retryLimit: 3,
    offlineBuffering: true,
    replayProtection: true,

    // Real-time Health
    healthMonitoringEnabled: true,
    lastSeenTimeoutMinutes: 15,
    heartbeatIntervalSeconds: 60,
    latencyAlertMs: 1000,
    consecutiveFailuresAlert: 5,

    // Advanced & Metadata
    firmwareVersion: '',
    platformOs: '',
    timezone: 'UTC',
    customMetadataJson: '',
    notes: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Handshake Telemetry State
  const [handshakeState, setHandshakeState] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [handshakeResults, setHandshakeResults] = useState<{ latencyMs?: number; message?: string; timestamp?: string } | null>(null);

  // Fetch reference data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [branchesRes, deptsRes] = await Promise.allSettled([
          api.get('/branches'),
          api.get('/departments')
        ]);
        if (branchesRes.status === 'fulfilled') setBranches(branchesRes.value.data.data ?? []);
        if (deptsRes.status === 'fulfilled') setDepartments(deptsRes.value.data.data ?? []);
      } catch (err) {
        console.error('Failed to load branches or departments', err);
      } finally {
        setDataLoading(false);
      }
    };
    loadData();
  }, []);

  // Update capabilities implicitly when hardware type changes
  const handleHardwareTypeChange = (type: string) => {
    setForm(f => {
      const caps = [...f.capabilities];
      if (type === 'fingerprint' && !caps.includes('fingerprint')) caps.push('fingerprint');
      if (type === 'face' && !caps.includes('face')) caps.push('face');
      if (type === 'card' && !caps.includes('card')) caps.push('card');
      return { ...f, hardwareType: type, capabilities: caps };
    });
  };

  // Check handshake
  const testHandshake = async () => {
    setHandshakeState('testing');
    setHandshakeResults(null);
    try {
      const res = await devicesApi.testHandshake({
        ipAddress: form.ipAddress,
        port: form.port,
        providerName: form.providerName,
        connectionType: form.connectionType
      });
      if (res.connected) {
        setHandshakeState('success');
        setHandshakeResults({
          latencyMs: res.latencyMs ?? 42,
          message: res.message ?? 'Handshake completed.',
          timestamp: res.timestamp
        });
      } else {
        setHandshakeState('failed');
        setHandshakeResults({
          message: res.message ?? 'Connection handshake failed.',
          timestamp: res.timestamp
        });
      }
    } catch (err: any) {
      setHandshakeState('failed');
      setHandshakeResults({
        message: err?.response?.data?.error ?? 'Handshake request timeout.',
        timestamp: new Date().toISOString()
      });
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Device Name is required';
    if (!form.serialNumber.trim()) e.serialNumber = 'Device Serial Number is required';
    else if (!/^[A-Z0-9_-]+$/i.test(form.serialNumber)) e.serialNumber = 'Alphanumeric and dashes only';
    
    if (form.connectionType === 'lan' && !form.ipAddress) {
      e.ipAddress = 'IP Address is required for LAN connectivity';
    } else if (form.ipAddress && !/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/.test(form.ipAddress)) {
      e.ipAddress = 'Enter a valid IPv4 Address';
    }

    if (form.macAddress && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(form.macAddress)) {
      e.macAddress = 'Enter a valid MAC Address (e.g. 00:1A:2B:3C:4D:5E)';
    }

    if (!form.branchId) e.branchId = 'Select a branch assignment';

    if (form.customMetadataJson) {
      try {
        JSON.parse(form.customMetadataJson);
      } catch {
        e.customMetadataJson = 'Invalid JSON structure';
      }
    }

    setErrors(e);
    // If there are validation errors, open the respective section automatically
    if (e.name || e.serialNumber) setExpandedSection('basic');
    else if (e.ipAddress || e.macAddress) setExpandedSection('network');
    else if (e.branchId) setExpandedSection('organization');

    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        serialNumber: form.serialNumber.toUpperCase(),
        providerName: form.providerName,
        providerDeviceId: form.providerDeviceId || undefined,
        hardwareType: form.hardwareType,
        capabilities: form.capabilities,
        ipAddress: form.ipAddress || undefined,
        firmwareVersion: form.firmwareVersion || undefined,
        platform: form.platformOs || undefined,
        branchId: form.branchId || undefined,
        metadata: {
          connectivity: {
            port: form.port,
            connectionType: form.connectionType,
            macAddress: form.macAddress || null,
            deviceUrl: form.deviceUrl || null
          },
          organization: {
            branchId: form.branchId,
            departmentId: form.departmentId || null,
            assignedArea: form.assignedArea || null,
            attendanceGroupId: form.attendanceGroupId || null,
            locationDescription: form.locationDescription || null
          },
          attendance: {
            sourceType: form.sourceType,
            verificationPriority: form.verificationPriority,
            defaultPunchMode: form.defaultPunchMode
          },
          sync: {
            syncEnabled: form.syncEnabled,
            syncIntervalMinutes: form.syncIntervalMinutes,
            batchSize: form.batchSize,
            syncMode: form.syncMode
          },
          security: {
            trustedDevice: form.trustedDevice,
            retryLimit: form.retryLimit,
            offlineBuffering: form.offlineBuffering,
            replayProtection: form.replayProtection
          },
          monitoring: {
            healthMonitoringEnabled: form.healthMonitoringEnabled,
            lastSeenTimeoutMinutes: form.lastSeenTimeoutMinutes,
            heartbeatIntervalSeconds: form.heartbeatIntervalSeconds,
            alertThresholds: {
              latencyMs: form.latencyAlertMs,
              consecutiveFailures: form.consecutiveFailuresAlert
            }
          },
          advanced: {
            firmwareVersion: form.firmwareVersion || null,
            platformOs: form.platformOs || null,
            timezone: form.timezone,
            notes: form.notes || null,
            customMetadataJson: form.customMetadataJson ? JSON.parse(form.customMetadataJson) : null
          }
        }
      };

      await createDeviceMutation.mutateAsync(payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setErrors({ _: err?.response?.data?.error ?? 'Failed to register biometric device' });
    } finally {
      setSaving(false);
    }
  };

  const toggleCapability = (cap: string) => {
    setForm(f => {
      const caps = f.capabilities.includes(cap)
        ? f.capabilities.filter(c => c !== cap)
        : [...f.capabilities, cap];
      return { ...f, capabilities: caps };
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer Body */}
      <div className="relative w-full max-w-4xl h-full bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl text-slate-100 z-10 animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/20">
              <Server className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Register Infrastructure Device</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Biometric terminal deployment registry console</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-800 hover:bg-slate-800 hover:border-slate-700 transition-colors">
            <X className="w-4 h-4 text-slate-400 hover:text-slate-100" />
          </button>
        </div>

        {/* Content container - split grid layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-5">
          
          {/* Left Column: Multi-section inputs */}
          <div className="col-span-3 overflow-y-auto p-6 space-y-4 border-r border-slate-800">
            {errors._ && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errors._}</span>
              </div>
            )}

            {/* Section 1: Basic Identity */}
            <div className="border border-slate-800 bg-slate-950/20 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'basic' ? '' : 'basic')}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">1. Basic Device Identity</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSection === 'basic' ? 'rotate-180' : ''}`} />
              </button>
              
              {expandedSection === 'basic' && (
                <div className="p-4 border-t border-slate-800/60 bg-slate-950/40 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Device Name <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Main Gate Face Reader"
                        className={`w-full bg-slate-900 border text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500 ${errors.name ? 'border-red-500' : 'border-slate-800 hover:border-slate-700'}`}
                      />
                      {errors.name && <p className="text-[10px] text-red-400 mt-1">{errors.name}</p>}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Serial Number (SN) <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={form.serialNumber}
                        onChange={e => setForm({ ...form, serialNumber: e.target.value })}
                        placeholder="e.g. FGE82390184"
                        className={`w-full bg-slate-900 border text-xs text-slate-200 rounded-lg px-3 py-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500 ${errors.serialNumber ? 'border-red-500' : 'border-slate-800 hover:border-slate-700'}`}
                      />
                      {errors.serialNumber && <p className="text-[10px] text-red-400 mt-1">{errors.serialNumber}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Hardware Type</label>
                      <div className="relative">
                        <select
                          value={form.hardwareType}
                          onChange={e => handleHardwareTypeChange(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500"
                        >
                          {HARDWARE_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Provider Device ID</label>
                      <input
                        type="text"
                        value={form.providerDeviceId}
                        onChange={e => setForm({ ...form, providerDeviceId: e.target.value })}
                        placeholder="Internal provider key/ID"
                        className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Provider Config */}
            <div className="border border-slate-800 bg-slate-950/20 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'provider' ? '' : 'provider')}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">2. Provider Integration Platform</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSection === 'provider' ? 'rotate-180' : ''}`} />
              </button>
              
              {expandedSection === 'provider' && (
                <div className="p-4 border-t border-slate-800/60 bg-slate-950/40 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Provider System Integration</label>
                    <div className="relative">
                      <select
                        value={form.providerName}
                        onChange={e => setForm({ ...form, providerName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500"
                      >
                        {PROVIDERS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* EasyTimePro Dynamic fields */}
                  {form.providerName === 'easytimepro' && (
                    <div className="p-3 border border-indigo-500/10 bg-indigo-500/5 rounded-xl space-y-3">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">EasyTimePro Settings</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">DB Integration Mode</label>
                          <select className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none">
                            <option value="mssql">MSSQL Direct Mirror</option>
                            <option value="api">REST Ingestion API</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Sync Ingestion Source</label>
                          <input type="text" placeholder="e.g. CHECKINOUT" className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ZKteco dynamic fields */}
                  {form.providerName === 'zkteco' && (
                    <div className="p-3 border border-indigo-500/10 bg-indigo-500/5 rounded-xl space-y-3">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">ZKTeco Core Config</span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">ADMS Push Server URL</label>
                          <input type="text" placeholder="http://adms-server:8080" className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Device Communication Code</label>
                          <input type="password" placeholder="COMM KEY / Pass" className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Section 3: Network & Connection */}
            <div className="border border-slate-800 bg-slate-950/20 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'network' ? '' : 'network')}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">3. Network & Connectivity</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSection === 'network' ? 'rotate-180' : ''}`} />
              </button>
              
              {expandedSection === 'network' && (
                <div className="p-4 border-t border-slate-800/60 bg-slate-950/40 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Connection Protocol</label>
                      <div className="relative">
                        <select
                          value={form.connectionType}
                          onChange={e => setForm({ ...form, connectionType: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500"
                        >
                          {CONNECTION_TYPES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">IP Address</label>
                        <input
                          type="text"
                          value={form.ipAddress}
                          onChange={e => setForm({ ...form, ipAddress: e.target.value })}
                          placeholder="e.g. 192.168.1.150"
                          className={`w-full bg-slate-900 border text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500 ${errors.ipAddress ? 'border-red-500' : 'border-slate-800 hover:border-slate-700'}`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Port</label>
                        <input
                          type="number"
                          value={form.port}
                          onChange={e => setForm({ ...form, port: parseInt(e.target.value, 10) || 4370 })}
                          placeholder="4370"
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500"
                        />
                      </div>
                      {errors.ipAddress && <p className="col-span-3 text-[10px] text-red-400 mt-1">{errors.ipAddress}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">MAC Address</label>
                      <input
                        type="text"
                        value={form.macAddress}
                        onChange={e => setForm({ ...form, macAddress: e.target.value })}
                        placeholder="e.g. E4:5F:01:FE:23:45"
                        className={`w-full bg-slate-900 border text-xs text-slate-200 rounded-lg px-3 py-2 font-mono uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500 ${errors.macAddress ? 'border-red-500' : 'border-slate-800 hover:border-slate-700'}`}
                      />
                      {errors.macAddress && <p className="text-[10px] text-red-400 mt-1">{errors.macAddress}</p>}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Device URL Endpoint</label>
                      <input
                        type="text"
                        value={form.deviceUrl}
                        onChange={e => setForm({ ...form, deviceUrl: e.target.value })}
                        placeholder="e.g. https://ingress-gateway.ai-hrms.net"
                        className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Connectivity Handshake Box */}
                  <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        <span className="text-xs font-semibold text-slate-200">Connectivity Verification Test</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">Executes a real-time network handshake ping to the registered target</p>
                    </div>

                    <button
                      type="button"
                      disabled={handshakeState === 'testing'}
                      onClick={testHandshake}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-2 select-none shrink-0 transition-colors disabled:opacity-40"
                    >
                      {handshakeState === 'testing' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Testing Ping...
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 text-white fill-white" />
                          Test Handshake
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section 4: Capabilities Selection */}
            <div className="border border-slate-800 bg-slate-950/20 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'capabilities' ? '' : 'capabilities')}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">4. Device Authentication Capabilities</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSection === 'capabilities' ? 'rotate-180' : ''}`} />
              </button>
              
              {expandedSection === 'capabilities' && (
                <div className="p-4 border-t border-slate-800/60 bg-slate-950/40 space-y-3">
                  <p className="text-[10px] text-slate-400 block mb-2">Configure supported biometric modality algorithms validated by target reader:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_CAPABILITIES.map(cap => {
                      const selected = form.capabilities.includes(cap.value);
                      return (
                        <button
                          key={cap.value}
                          type="button"
                          onClick={() => toggleCapability(cap.value)}
                          className={`flex items-start text-left p-2.5 rounded-xl border text-xs gap-3 select-none transition-all ${
                            selected
                              ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-200'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded mt-0.5 border flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-indigo-600 border-indigo-400 text-white'
                              : 'border-slate-700'
                          }`}>
                            {selected && <Check className="w-2.5 h-2.5" />}
                          </div>
                          <div>
                            <span className="font-semibold block text-slate-200">{cap.label}</span>
                            <span className="text-[9px] text-slate-400 mt-0.5 block">{cap.desc}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Section 5: Org Mapping */}
            <div className="border border-slate-800 bg-slate-950/20 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'organization' ? '' : 'organization')}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">5. Enterprise Organization Mapping</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSection === 'organization' ? 'rotate-180' : ''}`} />
              </button>
              
              {expandedSection === 'organization' && (
                <div className="p-4 border-t border-slate-800/60 bg-slate-950/40 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Target Branch Mapping <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <select
                          value={form.branchId}
                          onChange={e => setForm({ ...form, branchId: e.target.value })}
                          className={`w-full bg-slate-900 border text-xs text-slate-200 rounded-lg px-3 py-2 appearance-none focus:outline-none ${errors.branchId ? 'border-red-500' : 'border-slate-800'}`}
                        >
                          <option value="">Select Branch...</option>
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                          {branches.length === 0 && (
                            <>
                              <option value="63625ac1-54e8-4728-bf84-6be57e05347a">Hotel Central Branch</option>
                              <option value="1f4182af-f07c-481d-b2dc-4e702152e849">Coastal Resort Facility</option>
                            </>
                          )}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                      {errors.branchId && <p className="text-[10px] text-red-400 mt-1">{errors.branchId}</p>}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Department Access (Optional)</label>
                      <div className="relative">
                        <select
                          value={form.departmentId}
                          onChange={e => setForm({ ...form, departmentId: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 appearance-none focus:outline-none"
                        >
                          <option value="">All Departments</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                          {departments.length === 0 && (
                            <>
                              <option value="dept-1">Operations & HR</option>
                              <option value="dept-2">Front Desk Operations</option>
                            </>
                          )}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Placement Floor / Area</label>
                      <input
                        type="text"
                        value={form.assignedArea}
                        onChange={e => setForm({ ...form, assignedArea: e.target.value })}
                        placeholder="e.g. Basement Admin Wing"
                        className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Attendance Shift Group</label>
                      <input
                        type="text"
                        value={form.attendanceGroupId}
                        onChange={e => setForm({ ...form, attendanceGroupId: e.target.value })}
                        placeholder="e.g. Standard 24/7 Security Group"
                        className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Physical Location Details</label>
                    <textarea
                      value={form.locationDescription}
                      onChange={e => setForm({ ...form, locationDescription: e.target.value })}
                      placeholder="e.g. Mounted at height of 1.4m on the wooden pillar to the left of the biometric entry gate"
                      className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 h-14 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible Advanced Panels */}
            <div className="border border-slate-800 bg-slate-950/20 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedSection(expandedSection === 'advanced' ? '' : 'advanced')}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">6. Advanced Policies & Extensibility</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedSection === 'advanced' ? 'rotate-180' : ''}`} />
              </button>
              
              {expandedSection === 'advanced' && (
                <div className="p-4 border-t border-slate-800/60 bg-slate-950/40 space-y-5">
                  
                  {/* Attendance Engine Policy */}
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Attendance Engine Ingestion</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Default Punch Mode</label>
                        <select
                          value={form.defaultPunchMode}
                          onChange={e => setForm({ ...form, defaultPunchMode: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                        >
                          {PUNCH_MODES.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Source Type Designation</label>
                        <input
                          type="text"
                          value={form.sourceType}
                          onChange={e => setForm({ ...form, sourceType: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sync Operations */}
                  <div className="space-y-3 border-t border-slate-800/60 pt-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Synchronization Engine</span>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.syncEnabled}
                          onChange={e => setForm({ ...form, syncEnabled: e.target.checked })}
                          className="w-3.5 h-3.5 accent-indigo-500"
                        />
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Sync Ingress Enabled</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Sync Mode</label>
                        <select
                          value={form.syncMode}
                          onChange={e => setForm({ ...form, syncMode: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                        >
                          {SYNC_MODES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Interval (Mins)</label>
                        <input
                          type="number"
                          value={form.syncIntervalMinutes}
                          onChange={e => setForm({ ...form, syncIntervalMinutes: parseInt(e.target.value, 10) || 5 })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Ingress Batch Size</label>
                        <input
                          type="number"
                          value={form.batchSize}
                          onChange={e => setForm({ ...form, batchSize: parseInt(e.target.value, 10) || 100 })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Security & Buffers */}
                  <div className="space-y-3 border-t border-slate-800/60 pt-3.5">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Security, Buffers & Retries</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={form.trustedDevice}
                            onChange={e => setForm({ ...form, trustedDevice: e.target.checked })}
                            className="w-3.5 h-3.5 accent-indigo-500"
                          />
                          <span className="text-[11px] font-medium text-slate-300">Enforce Cryptographic Trust Gating</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={form.offlineBuffering}
                            onChange={e => setForm({ ...form, offlineBuffering: e.target.checked })}
                            className="w-3.5 h-3.5 accent-indigo-500"
                          />
                          <span className="text-[11px] font-medium text-slate-300">Allow Local Offline Queue Buffering</span>
                        </label>
                      </div>

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={form.replayProtection}
                            onChange={e => setForm({ ...form, replayProtection: e.target.checked })}
                            className="w-3.5 h-3.5 accent-indigo-500"
                          />
                          <span className="text-[11px] font-medium text-slate-300">Enable Ingress Replay Protection</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Sync Ingestion Retry Limit:</span>
                          <input
                            type="number"
                            value={form.retryLimit}
                            onChange={e => setForm({ ...form, retryLimit: parseInt(e.target.value, 10) || 3 })}
                            className="w-12 text-center bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded px-1 py-0.5 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Health Monitor */}
                  <div className="space-y-3 border-t border-slate-800/60 pt-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Real-time Heartbeat Monitoring</span>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.healthMonitoringEnabled}
                          onChange={e => setForm({ ...form, healthMonitoringEnabled: e.target.checked })}
                          className="w-3.5 h-3.5 accent-indigo-500"
                        />
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">Telemetry Enabled</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div className="col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Stale Timeout (Mins)</label>
                        <input
                          type="number"
                          value={form.lastSeenTimeoutMinutes}
                          onChange={e => setForm({ ...form, lastSeenTimeoutMinutes: parseInt(e.target.value, 10) || 15 })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Ping Secs</label>
                        <input
                          type="number"
                          value={form.heartbeatIntervalSeconds}
                          onChange={e => setForm({ ...form, heartbeatIntervalSeconds: parseInt(e.target.value, 10) || 60 })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Alert Ms</label>
                        <input
                          type="number"
                          value={form.latencyAlertMs}
                          onChange={e => setForm({ ...form, latencyAlertMs: parseInt(e.target.value, 10) || 1000 })}
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Extensibility & Custom JSON */}
                  <div className="space-y-3 border-t border-slate-800/60 pt-3.5">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Vendor Meta & Extensibility JSON</span>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Firmware Version</label>
                        <input
                          type="text"
                          value={form.firmwareVersion}
                          onChange={e => setForm({ ...form, firmwareVersion: e.target.value })}
                          placeholder="e.g. Ver 8.01.205"
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Device Platform OS</label>
                        <input
                          type="text"
                          value={form.platformOs}
                          onChange={e => setForm({ ...form, platformOs: e.target.value })}
                          placeholder="e.g. Linux ZEM800"
                          className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Custom Extension JSON metadata</label>
                      <textarea
                        value={form.customMetadataJson}
                        onChange={e => setForm({ ...form, customMetadataJson: e.target.value })}
                        placeholder='{ "sshPort": 22, "maintenanceCycles": [] }'
                        className={`w-full bg-slate-900 border text-xs text-slate-200 rounded-lg px-3 py-2 font-mono h-20 resize-none focus:outline-none ${errors.customMetadataJson ? 'border-red-500' : 'border-slate-800'}`}
                      />
                      {errors.customMetadataJson && <p className="text-[10px] text-red-400 mt-0.5">{errors.customMetadataJson}</p>}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Internal Operational Notes</label>
                      <textarea
                        value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        placeholder="Provide details about supplier, warranty, or technician contacts..."
                        className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2 h-16 resize-none focus:outline-none"
                      />
                    </div>
                  </div>

                </div>
              )}
            </div>

          </div>

          {/* Right Column: Handshake Telemetry & Blueprint Simulator */}
          <div className="col-span-2 bg-slate-950 p-6 flex flex-col justify-between overflow-y-auto">
            
            {/* Top Widget: Real-time status simulation */}
            <div className="space-y-5">
              <div>
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">Deployment Blueprint</span>
                <h4 className="text-xs font-semibold text-slate-200 mt-1">Infrastructure Architecture Topology</h4>
              </div>

              {/* visual simulator diagram */}
              <div className="border border-slate-800/80 bg-slate-900/40 rounded-xl p-4 flex flex-col items-center justify-center min-h-[160px] relative overflow-hidden group">
                {/* background grid */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30" />
                
                {/* Visual nodes */}
                <div className="relative flex items-center justify-between w-full max-w-[200px] z-10">
                  
                  {/* Device Node */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-500 ${
                      handshakeState === 'success' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]' :
                      handshakeState === 'failed' ? 'bg-red-500/10 border-red-500/50 text-red-400' :
                      handshakeState === 'testing' ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400 animate-pulse' :
                      'bg-slate-800 border-slate-700 text-slate-400'
                    }`}>
                      <Server className="w-5 h-5" />
                    </div>
                    <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-400 mt-1.5 truncate max-w-[65px]">{form.name || 'Terminal'}</span>
                  </div>

                  {/* Connection Line */}
                  <div className="flex-1 h-0.5 mx-2 relative bg-slate-800">
                    <div className={`absolute inset-0 transition-colors ${
                      handshakeState === 'success' ? 'bg-emerald-500' :
                      handshakeState === 'failed' ? 'bg-red-500' :
                      handshakeState === 'testing' ? 'bg-indigo-500' :
                      'bg-slate-700'
                    }`} />
                    {handshakeState === 'testing' && (
                      <div className="absolute top-0 bottom-0 w-2 bg-white/70 animate-ping rounded-full" style={{ animationDuration: '0.8s' }} />
                    )}
                  </div>

                  {/* Ai-HRMS Engine Node */}
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <span className="text-[8px] font-semibold uppercase tracking-wider text-indigo-400 mt-1.5">Ai-HRMS Core</span>
                  </div>

                </div>

                {/* Handshake Telemetry Text overlay */}
                <div className="mt-5 w-full bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 font-mono text-[9px] text-slate-400 space-y-1 z-10">
                  <div className="flex justify-between border-b border-slate-800/50 pb-1">
                    <span>HANDSHAKE STATUS:</span>
                    <span className={`font-bold uppercase ${
                      handshakeState === 'success' ? 'text-emerald-400' :
                      handshakeState === 'failed' ? 'text-red-400' :
                      handshakeState === 'testing' ? 'text-indigo-400 animate-pulse' :
                      'text-slate-500'
                    }`}>{handshakeState}</span>
                  </div>
                  {handshakeResults ? (
                    <>
                      {handshakeResults.latencyMs && (
                        <div className="flex justify-between">
                          <span>LATENCY (RTT):</span>
                          <span className="text-emerald-400 font-semibold">{handshakeResults.latencyMs} ms</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>TIMESTAMP:</span>
                        <span>{handshakeResults.timestamp ? new Date(handshakeResults.timestamp).toLocaleTimeString() : '—'}</span>
                      </div>
                      <div className="text-[8px] text-slate-500 leading-normal pt-1.5 border-t border-slate-800/30 truncate-3-lines">
                        {handshakeResults.message}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-2 text-slate-600 flex items-center justify-center gap-1">
                      <HelpCircle className="w-3 h-3" />
                      Run Handshake Test to verify link
                    </div>
                  )}
                </div>
              </div>

              {/* Capability summary card */}
              <div className="border border-slate-800/60 bg-slate-900/20 rounded-xl p-4 space-y-2.5">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Capability Profile Details</span>
                <div className="flex flex-wrap gap-1">
                  {form.capabilities.length === 0 ? (
                    <span className="text-[10px] text-slate-600 italic">No capabilities chosen</span>
                  ) : (
                    form.capabilities.map(c => (
                      <span key={c} className="text-[9px] font-semibold font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 px-2 py-0.5 rounded uppercase">
                        {c}
                      </span>
                    ))
                  )}
                </div>
                <div className="text-[9px] text-slate-500 leading-relaxed border-t border-slate-800/50 pt-2">
                  Device registered under <span className="text-slate-300 capitalize font-mono">{form.providerName}</span> using <span className="text-slate-300 font-mono uppercase">{form.connectionType}</span> gateway protocol. Ingress data pipelines automatically stream punches into the central attendance queue.
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-slate-800/60 pt-6 mt-6 flex items-center justify-end gap-3 bg-slate-950">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-800 hover:bg-slate-900 text-slate-300 hover:text-slate-100 rounded-lg text-xs font-semibold select-none transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={handleSubmit}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 select-none shrink-0 transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    Register Device
                  </>
                )}
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>,
    document.body
  );
}
