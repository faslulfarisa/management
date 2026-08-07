import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { SyncCursorType } from './biometric-sync.types';

export interface SyncLogResult {
  status: 'success' | 'partial' | 'failed';
  cursorAfter: string | null;
  recordsFetched: number;
  recordsSynced: number;
  recordsSkipped: number;
  recordsFailed: number;
  durationMs: number;
  errorSummary?: string;
}

/**
 * Manages per-integration sync watermarks (biometric_sync_cursors) and
 * writes operational audit rows to biometric_sync_logs.
 *
 * Cursor advancement is intentionally separated from log writing so that
 * a failed run leaves the cursor unchanged and the next run re-fetches the
 * same window — guaranteeing at-least-once delivery into the punch queue.
 */
@Injectable()
export class SyncCursorService {
  private readonly logger = new Logger(SyncCursorService.name);

  constructor(private readonly db: DatabaseService) {}

  // ── Cursor ────────────────────────────────────────────────────────────────

  async getCursor(
    tenantId: string,
    integrationId: string,
    providerName: string,
    cursorType: SyncCursorType,
  ): Promise<string | null> {
    const { rows } = await this.db.query(
      `SELECT last_cursor
       FROM biometric_sync_cursors
       WHERE tenant_id      = $1
         AND integration_id = $2
         AND provider_name  = $3
         AND cursor_type    = $4`,
      [tenantId, integrationId, providerName, cursorType],
    );
    return (rows[0]?.last_cursor as string) ?? null;
  }

  /**
   * Atomically upserts the cursor for a given (tenant, integration, provider,
   * cursorType) tuple. Only called after a successful sync run — callers must
   * NOT call this when the run fails so the next retry re-fetches the window.
   */
  async setCursor(
    tenantId: string,
    integrationId: string,
    providerName: string,
    cursorType: SyncCursorType,
    cursor: string,
    recordsSynced: number,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO biometric_sync_cursors
         (tenant_id, integration_id, provider_name, cursor_type,
          last_cursor, last_sync_at, records_synced)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (tenant_id, integration_id, provider_name, cursor_type)
       DO UPDATE SET
         last_cursor    = EXCLUDED.last_cursor,
         last_sync_at   = NOW(),
         records_synced = EXCLUDED.records_synced`,
      [tenantId, integrationId, providerName, cursorType, cursor, recordsSynced],
    );

    this.logger.log(
      JSON.stringify({
        event: 'cursor_advanced',
        tenantId,
        integrationId,
        providerName,
        cursorType,
        cursor,
        recordsSynced,
      }),
    );
  }

  // ── Sync Logs ─────────────────────────────────────────────────────────────

  /**
   * Opens a sync log row with status='success' as a placeholder.
   * Returns the UUID of the new row; pass it to completeSyncLog() when done.
   * Status is corrected to 'partial' or 'failed' in completeSyncLog().
   */
  async beginSyncLog(
    tenantId: string,
    integrationId: string,
    providerName: string,
    cursorType: SyncCursorType,
    cursorBefore: string | null,
  ): Promise<string> {
    const { rows } = await this.db.query(
      `INSERT INTO biometric_sync_logs
         (tenant_id, integration_id, provider_name, cursor_type,
          cursor_before, status, started_at)
       VALUES ($1, $2, $3, $4, $5, 'success', NOW())
       RETURNING id`,
      [tenantId, integrationId, providerName, cursorType, cursorBefore],
    );
    return rows[0].id as string;
  }

  /**
   * Finalizes the sync log row opened by beginSyncLog().
   * Safe to call from a finally block — errors here are logged but not re-thrown
   * so they don't mask the original sync error.
   */
  async completeSyncLog(logId: string, result: SyncLogResult): Promise<void> {
    try {
      await this.db.query(
        `UPDATE biometric_sync_logs SET
           status          = $2,
           cursor_after    = $3,
           records_fetched = $4,
           records_synced  = $5,
           records_skipped = $6,
           records_failed  = $7,
           duration_ms     = $8,
           error_summary   = $9,
           completed_at    = NOW()
         WHERE id = $1`,
        [
          logId,
          result.status,
          result.cursorAfter,
          result.recordsFetched,
          result.recordsSynced,
          result.recordsSkipped,
          result.recordsFailed,
          result.durationMs,
          result.errorSummary ?? null,
        ],
      );
    } catch (err: any) {
      this.logger.error(
        JSON.stringify({
          event: 'sync_log_write_failed',
          logId,
          error: err?.message,
        }),
      );
    }
  }
}
