import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:AES256GCM:';
const SENSITIVE_KEY_PATTERN = /(password|secret|token|api[_-]?key|client[_-]?secret|private[_-]?key|account[_-]?number|ifsc|upi|aadhaar|aadhar|pan|passport|license|voter|phone|email|address|contact)/i;

/**
 * AES-256-GCM encryption for sensitive integration credentials stored in JSONB config.
 *
 * Convention: encrypted fields are stored with an `_enc` suffix.
 *   { mssqlPassword_enc: "enc:v1:AES256GCM:<iv>:<tag>:<ciphertext>" }
 * decryptConfig() strips the suffix and returns plaintext under the bare key.
 *
 * Master key: CREDENTIAL_MASTER_KEY env var — 64-char hex (32 bytes).
 * Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * If CREDENTIAL_MASTER_KEY is not set, encryption is disabled only outside
 * production. Production writes fail closed instead of storing plaintext.
 */
@Injectable()
export class CredentialEncryptionService {
  private readonly logger = new Logger(CredentialEncryptionService.name);
  private readonly key: Buffer | null;

  constructor() {
    const hex = process.env.CREDENTIAL_MASTER_KEY ?? '';
    if (!hex) {
      this.logger.warn(
        'CREDENTIAL_MASTER_KEY is not set — credential encryption disabled. ' +
        'Set a 64-char hex key before storing production credentials.',
      );
      this.key = null;
      return;
    }
    if (hex.length !== 64) {
      throw new Error(
        'CREDENTIAL_MASTER_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    this.key = Buffer.from(hex, 'hex');
  }

  encrypt(plaintext: string): string {
    if (!this.key) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('CREDENTIAL_MASTER_KEY is required for production encryption');
      }
      return plaintext;
    }
    if (this.isEncrypted(plaintext)) return plaintext;
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
  }

  decrypt(value: string): string {
    if (!value.startsWith(PREFIX)) return value;
    if (!this.key) {
      this.logger.error(
        'Encrypted credential found but CREDENTIAL_MASTER_KEY is not set — cannot decrypt',
      );
      throw new Error('Cannot decrypt credential: CREDENTIAL_MASTER_KEY is not configured');
    }
    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 3) throw new Error('Malformed encrypted credential');
    const [ivHex, tagHex, ctHex] = parts;
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }

  isEncrypted(value: unknown): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
  }

  blindIndex(value: unknown, tenantId?: string | null): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (!this.key) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('CREDENTIAL_MASTER_KEY is required for production blind indexes');
      }
      return null;
    }
    const normalized = String(value).trim().toLowerCase();
    const scoped = tenantId ? `${tenantId}:${normalized}` : normalized;
    return createHmac('sha256', this.key).update(scoped).digest('hex');
  }

  encryptNullable(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    return this.encrypt(typeof value === 'string' ? value : JSON.stringify(value));
  }

  decryptNullable<T = string>(value: unknown): T | null {
    if (value === null || value === undefined || value === '') return null;
    const decrypted = this.decrypt(String(value));
    try {
      return JSON.parse(decrypted) as T;
    } catch {
      return decrypted as T;
    }
  }

  decryptRow<T extends Record<string, any>>(row: T, fields: string[]): T {
    const result = { ...row } as Record<string, any>;
    for (const field of fields) {
      if (result[field] !== null && result[field] !== undefined && this.isEncrypted(result[field])) {
        result[field] = this.decryptNullable(result[field]);
      }
    }
    return result as T;
  }

  encryptFields<T extends Record<string, any>>(data: T, fields: string[]): T {
    const result = { ...data } as Record<string, any>;
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(result, field)) {
        result[field] = this.encryptNullable(result[field]);
      }
    }
    return result as T;
  }

  /**
   * Decrypt all `_enc`-suffixed fields in a config object and return the result
   * with bare keys containing the plaintext values.
   *
   * Input:  { mssqlPassword_enc: "enc:v1:...", mssqlHost: "10.0.0.1" }
   * Output: { mssqlPassword: "secret",        mssqlHost: "10.0.0.1" }
   *
   * Plaintext fields (no _enc suffix) are passed through unchanged, so the
   * function is safe to call on configs that have not been encrypted yet.
   */
  decryptConfig<T extends Record<string, any>>(config: T): T {
    const result = { ...config } as Record<string, any>;
    for (const key of Object.keys(config)) {
      if (key.endsWith('_enc') && typeof config[key] === 'string') {
        const plainKey = key.slice(0, -4);
        result[plainKey] = this.decrypt(config[key]);
        delete result[key];
      }
    }
    return result as T;
  }

  encryptConfig<T extends Record<string, any>>(config: T): T {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(config || {})) {
      if (value === null || value === undefined) {
        result[key] = value;
      } else if (key.endsWith('_enc')) {
        result[key] = typeof value === 'string' ? this.encrypt(value) : this.encrypt(JSON.stringify(value));
      } else if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[`${key}_enc`] = typeof value === 'string' ? this.encrypt(value) : this.encrypt(JSON.stringify(value));
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }
}
