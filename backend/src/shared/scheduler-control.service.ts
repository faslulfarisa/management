import { Injectable, Logger } from '@nestjs/common';

type SchedulerStatus = {
  name: string;
  enabled: boolean;
  lastRunAt?: string;
  lastSkippedAt?: string;
  skipReason?: string;
  runCount: number;
  errorCount: number;
  lastError?: string;
};

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return fallback;
}

@Injectable()
export class SchedulerControlService {
  private readonly logger = new Logger(SchedulerControlService.name);
  private readonly statuses = new Map<string, SchedulerStatus>();

  isEnabled(name: string): boolean {
    const enabled = readBooleanEnv('ENABLE_SCHEDULERS', true);
    const instanceId = process.env.SCHEDULER_INSTANCE_ID;
    const leaderId = process.env.SCHEDULER_LEADER_INSTANCE_ID;
    const shouldRun = enabled && (!leaderId || instanceId === leaderId);

    const status = this.getOrCreate(name);
    status.enabled = shouldRun;

    if (!shouldRun) {
      status.lastSkippedAt = new Date().toISOString();
      status.skipReason = enabled ? 'not_leader_instance' : 'disabled_by_env';
    }

    return shouldRun;
  }

  async run<T>(name: string, task: () => Promise<T>): Promise<T | undefined> {
    if (!this.isEnabled(name)) return undefined;

    const status = this.getOrCreate(name);
    status.lastRunAt = new Date().toISOString();
    status.runCount += 1;
    status.skipReason = undefined;

    try {
      return await task();
    } catch (error: any) {
      status.errorCount += 1;
      status.lastError = error?.message ?? String(error);
      this.logger.error(`Scheduler ${name} failed: ${status.lastError}`);
      throw error;
    }
  }

  getSnapshot() {
    return {
      enabled: readBooleanEnv('ENABLE_SCHEDULERS', true),
      instanceId: process.env.SCHEDULER_INSTANCE_ID ?? null,
      leaderInstanceId: process.env.SCHEDULER_LEADER_INSTANCE_ID ?? null,
      schedulers: Array.from(this.statuses.values()).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  private getOrCreate(name: string): SchedulerStatus {
    const existing = this.statuses.get(name);
    if (existing) return existing;

    const created: SchedulerStatus = {
      name,
      enabled: true,
      runCount: 0,
      errorCount: 0,
    };
    this.statuses.set(name, created);
    return created;
  }
}
