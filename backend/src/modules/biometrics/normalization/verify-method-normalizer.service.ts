import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database.service';
import { VerifyMethod } from '../dto/punch-event.dto';

/**
 * Loads verification_method_mappings from the database once on startup and
 * caches them in memory. Provides O(1) normalization of provider-specific raw
 * verify-mode values to the Ai-HRMS VerifyMethod enum.
 *
 * To add mappings for a new provider, insert rows into
 * verification_method_mappings — no code change required.
 */
@Injectable()
export class VerifyMethodNormalizerService implements OnModuleInit {
  private readonly logger = new Logger(VerifyMethodNormalizerService.name);

  /** key: "<provider>:<rawValue>" → normalized VerifyMethod */
  private readonly cache = new Map<string, VerifyMethod>();

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /**
   * Normalize a raw provider verify-mode value to a VerifyMethod enum member.
   * Returns VerifyMethod.OTHER when the value is absent or unmapped.
   *
   * Both string and numeric raw values are supported; numeric values are
   * coerced to strings before lookup so that e.g. 1 and '1' both match.
   */
  normalize(
    rawValue: string | number | null | undefined,
    provider: string,
  ): VerifyMethod {
    if (rawValue == null) return VerifyMethod.OTHER;
    const key = `${provider}:${String(rawValue)}`;
    return this.cache.get(key) ?? VerifyMethod.OTHER;
  }

  /**
   * Re-reads the verification_method_mappings table and refreshes the cache.
   * Call this if mappings are added/updated at runtime without a restart.
   */
  async reload(): Promise<void> {
    try {
      const { rows } = await this.db.query(
        'SELECT provider_name, raw_value, normalized_method FROM verification_method_mappings',
      );
      const typedRows = rows as Array<{
        provider_name: string;
        raw_value: string;
        normalized_method: string;
      }>;

      this.cache.clear();
      for (const row of typedRows) {
        const key = `${row.provider_name}:${row.raw_value}`;
        this.cache.set(key, row.normalized_method as VerifyMethod);
      }

      this.logger.log(
        JSON.stringify({
          level: 'info',
          event: 'verify_method_mappings_loaded',
          count: typedRows.length,
        }),
      );
    } catch (err: any) {
      // Non-fatal on startup: unmapped values fall back to OTHER
      this.logger.warn(
        JSON.stringify({
          level: 'warn',
          event: 'verify_method_mappings_load_failed',
          error: err?.message,
        }),
      );
    }
  }
}
