/**
 * base-provider.interface.ts
 *
 * Vendor-agnostic contracts for all biometric attendance providers.
 *
 * IAttendanceProvider  — base for push-based providers (e.g. ZKTeco ADMS)
 * IPollingProvider     — extends base for cron-pull providers (e.g. EasyTimePro)
 */

import { PunchEventDto, ProviderSyncResultDto } from '../dto/punch-event.dto';

// ── Provider Health ──────────────────────────────────────────────────────────

export interface ProviderHealthResult {
  healthy: boolean;
  providerName: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

// ── Base Provider ────────────────────────────────────────────────────────────

/**
 * Every biometric provider must implement this interface.
 *
 * Responsibilities:
 *   - Parse raw vendor-specific payload into normalized PunchEventDto[]
 *   - Report health status
 *
 * The provider does NOT process attendance — that is the engine's job.
 */
export interface IAttendanceProvider {
  /** Unique stable provider identifier (e.g. 'zkteco', 'easytimepro') */
  readonly providerName: string;

  /**
   * Parse and normalize raw incoming data (from ADMS push, webhook, etc.)
   * into an array of PunchEventDtos.
   *
   * @param tenantId  The tenant this data belongs to
   * @param raw       The raw vendor payload (string body, JSON object, etc.)
   * @returns         Normalized punch events ready for the attendance engine
   */
  processIncoming(tenantId: string, raw: unknown): Promise<PunchEventDto[]>;

  /**
   * Optional health check — tests connectivity to the vendor system.
   */
  healthCheck?(tenantId: string): Promise<ProviderHealthResult>;
}

// ── Polling Provider ─────────────────────────────────────────────────────────

/**
 * Extension for providers that actively pull data on a schedule
 * (as opposed to waiting for the device/service to push data to us).
 *
 * Examples: EasyTimePro SQL polling, CSV file watchers.
 */
export interface IPollingProvider extends IAttendanceProvider {
  /**
   * Pull new punch events from the vendor since the last successful sync.
   * Implementations should track a cursor (timestamp/ID) per tenant to
   * avoid re-fetching already processed records.
   *
   * @param tenantId        The tenant to poll for
   * @param integrationId   The specific integration config record
   * @returns               Normalized punch events
   */
  poll(tenantId: string, integrationId: string): Promise<PunchEventDto[]>;
}

// ── Type Guard ───────────────────────────────────────────────────────────────

export function isPollingProvider(p: IAttendanceProvider): p is IPollingProvider {
  return typeof (p as IPollingProvider).poll === 'function';
}
