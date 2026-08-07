/**
 * provider-registry.service.ts
 *
 * Central registry for all biometric attendance providers.
 * Providers register themselves on module bootstrap via onModuleInit().
 * The attendance engine and scheduler look up providers here at runtime.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  IAttendanceProvider,
  IPollingProvider,
  isPollingProvider,
  ProviderHealthResult,
} from './base-provider.interface';

@Injectable()
export class ProviderRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistryService.name);

  /** Map of providerName → provider instance */
  private readonly registry = new Map<string, IAttendanceProvider>();

  onModuleInit() {
    this.logger.log(
      `Provider registry initialized with ${this.registry.size} provider(s): ` +
      `[${[...this.registry.keys()].join(', ')}]`,
    );
  }

  /**
   * Register a provider. Called by each provider's constructor or module setup.
   * Duplicate names will overwrite the previous registration with a warning.
   */
  register(provider: IAttendanceProvider): void {
    if (this.registry.has(provider.providerName)) {
      this.logger.warn(
        `Provider '${provider.providerName}' is already registered — overwriting.`,
      );
    }
    this.registry.set(provider.providerName, provider);
    this.logger.log(`Registered biometric provider: '${provider.providerName}'`);
  }

  /**
   * Retrieve a provider by name. Returns null if not found (caller decides how to handle).
   */
  get(providerName: string): IAttendanceProvider | null {
    return this.registry.get(providerName) ?? null;
  }

  /**
   * Get a polling-capable provider by name.
   * Returns null if not found or not a polling provider.
   */
  getPollingProvider(providerName: string): IPollingProvider | null {
    const provider = this.registry.get(providerName);
    if (!provider) return null;
    if (!isPollingProvider(provider)) {
      this.logger.warn(`Provider '${providerName}' does not support polling`);
      return null;
    }
    return provider;
  }

  /**
   * List all registered provider names.
   */
  listProviders(): string[] {
    return [...this.registry.keys()];
  }

  /**
   * List all polling-capable providers.
   */
  listPollingProviders(): IPollingProvider[] {
    return [...this.registry.values()].filter(isPollingProvider);
  }

  /**
   * Run health checks on all (or a specific) registered provider(s).
   */
  async healthCheckAll(tenantId: string): Promise<ProviderHealthResult[]> {
    const results: ProviderHealthResult[] = [];

    for (const provider of this.registry.values()) {
      if (provider.healthCheck) {
        try {
          const result = await provider.healthCheck(tenantId);
          results.push(result);
        } catch (err: any) {
          results.push({
            healthy: false,
            providerName: provider.providerName,
            error: err?.message ?? 'Unknown error',
          });
        }
      } else {
        // Provider doesn't implement healthCheck — report as unknown
        results.push({
          healthy: true, // assume healthy if no check defined
          providerName: provider.providerName,
          details: { note: 'healthCheck not implemented' },
        });
      }
    }

    return results;
  }
}
