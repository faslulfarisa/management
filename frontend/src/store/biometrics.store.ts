import { create } from 'zustand';
import type {
  PunchBroadcast,
  QueueHealthSnapshot,
  BiometricsAlert,
  DeviceStats,
  TerminalStats,
} from '@/types/biometrics';

const MAX_PUNCHES = 500;
const MAX_ALERTS = 50;

interface PunchesPerMinuteTracker {
  buckets: number[];
  lastMinute: number;
}

interface BiometricsState {
  // Connection
  wsConnected: boolean;
  setWsConnected: (v: boolean) => void;

  // Punch feed
  recentPunches: PunchBroadcast[];
  addPunch: (punch: PunchBroadcast) => void;
  clearPunches: () => void;

  // Punches/min computed metric
  punchesPerMinute: number;
  _ppmTracker: PunchesPerMinuteTracker;
  _tickPpm: () => void;

  // Punches today counter (reset on day boundary — authoritative source is REST on mount)
  punchesToday: number;
  setPunchesToday: (n: number) => void;
  incrementPunchesToday: () => void;

  // Queue health
  queueHealth: QueueHealthSnapshot | null;
  setQueueHealth: (h: QueueHealthSnapshot) => void;

  // Device & terminal aggregate stats (from REST polling)
  deviceStats: DeviceStats | null;
  setDeviceStats: (s: DeviceStats) => void;

  terminalStats: TerminalStats | null;
  setTerminalStats: (s: TerminalStats) => void;

  // Operational alerts
  alerts: BiometricsAlert[];
  addAlert: (a: BiometricsAlert) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;

  // Filters (live attendance feed)
  filters: {
    branchId?: string;
    provider?: string;
    search?: string;
    source?: string;
    verifyMethod?: string;
  };
  setFilter: (key: string, value: string | undefined) => void;
  resetFilters: () => void;

  // Autoscroll
  autoscroll: boolean;
  setAutoscroll: (v: boolean) => void;

  // Reset everything to its initial state — used when the active
  // organization changes, so no cross-org data (filters, feeds, alerts)
  // carries over into the new org's session.
  resetAll: () => void;
}

export const useBiometricsStore = create<BiometricsState>((set, get) => ({
  // ── Connection ──────────────────────────────────────────────────────────────
  wsConnected: false,
  setWsConnected: (wsConnected) => set({ wsConnected }),

  // ── Punch feed ──────────────────────────────────────────────────────────────
  recentPunches: [],
  addPunch: (punch) => {
    set((s) => ({
      recentPunches: [punch, ...s.recentPunches].slice(0, MAX_PUNCHES),
    }));
    get().incrementPunchesToday();
    get()._tickPpm();
  },
  clearPunches: () => set({ recentPunches: [] }),

  // ── Punches/min ─────────────────────────────────────────────────────────────
  punchesPerMinute: 0,
  _ppmTracker: { buckets: [], lastMinute: -1 },
  _tickPpm: () => {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60_000);
    set((s) => {
      const tracker = s._ppmTracker;
      const updatedBuckets =
        currentMinute === tracker.lastMinute
          ? [...tracker.buckets.slice(0, -1), (tracker.buckets.at(-1) ?? 0) + 1]
          : [...tracker.buckets, 1].slice(-5);
      const ppm = updatedBuckets.at(-1) ?? 0;
      return {
        _ppmTracker: { buckets: updatedBuckets, lastMinute: currentMinute },
        punchesPerMinute: ppm,
      };
    });
  },

  // ── Punches today ───────────────────────────────────────────────────────────
  punchesToday: 0,
  setPunchesToday: (punchesToday) => set({ punchesToday }),
  incrementPunchesToday: () => set((s) => ({ punchesToday: s.punchesToday + 1 })),

  // ── Queue health ────────────────────────────────────────────────────────────
  queueHealth: null,
  setQueueHealth: (queueHealth) => set({ queueHealth }),

  // ── Device / terminal stats ─────────────────────────────────────────────────
  deviceStats: null,
  setDeviceStats: (deviceStats) => set({ deviceStats }),

  terminalStats: null,
  setTerminalStats: (terminalStats) => set({ terminalStats }),

  // ── Alerts ──────────────────────────────────────────────────────────────────
  alerts: [],
  addAlert: (alert) =>
    set((s) => ({
      alerts: [alert, ...s.alerts].slice(0, MAX_ALERTS),
    })),
  dismissAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  clearAlerts: () => set({ alerts: [] }),

  // ── Filters ─────────────────────────────────────────────────────────────────
  filters: {},
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: {} }),

  // ── Autoscroll ──────────────────────────────────────────────────────────────
  autoscroll: true,
  setAutoscroll: (autoscroll) => set({ autoscroll }),

  // ── Reset (org switch) ─────────────────────────────────────────────────────
  resetAll: () =>
    set({
      wsConnected: false,
      recentPunches: [],
      punchesPerMinute: 0,
      _ppmTracker: { buckets: [], lastMinute: -1 },
      punchesToday: 0,
      queueHealth: null,
      deviceStats: null,
      terminalStats: null,
      alerts: [],
      filters: {},
      autoscroll: true,
    }),
}));

// Selector helpers for common patterns
export const selectFilteredPunches = (state: BiometricsState) => {
  const { recentPunches, filters } = state;
  return recentPunches.filter((p) => {
    if (filters.provider && p.provider !== filters.provider) return false;
    if (filters.branchId && p.branchId !== filters.branchId) return false;
    if (filters.source && p.attendanceSource !== filters.source) return false;
    if (filters.verifyMethod && p.verifyMethod !== filters.verifyMethod) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !p.employeeCode.toLowerCase().includes(q) &&
        !(p.employeeName ?? '').toLowerCase().includes(q) &&
        !p.provider.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });
};
