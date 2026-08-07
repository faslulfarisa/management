#!/usr/bin/env ts-node
/**
 * One-time migration: encrypt plaintext credentials in integrations.config JSONB.
 *
 * Run BEFORE deploying the CredentialEncryptionService change.
 * Safe to re-run — already-encrypted fields (enc:v1:... prefix) are skipped.
 *
 * Usage:
 *   CREDENTIAL_MASTER_KEY=<64-hex-chars> DATABASE_URL=<pg-url> \
 *     ts-node scripts/encrypt-integration-credentials.ts
 *
 * Generate a master key:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, randomBytes } from 'crypto';
import { Pool } from 'pg';

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:AES256GCM:';

// Fields to encrypt — add any new sensitive field names here
const SENSITIVE_FIELDS = [
  'mssqlPassword',
  'apiKey',
  'apiSecret',
  'password',
  'token',
  'secret',
];

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

async function main() {
  const keyHex = process.env.CREDENTIAL_MASTER_KEY ?? '';
  if (keyHex.length !== 64) {
    console.error('ERROR: CREDENTIAL_MASTER_KEY must be a 64-character hex string.');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  const key = Buffer.from(keyHex, 'hex');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query<{ id: string; type: string; config: Record<string, any> }>(
      `SELECT id, type, config FROM integrations WHERE type IN ('easytimepro', 'zkteco')`,
    );

    console.log(`Found ${rows.length} integration(s) to scan.`);
    let migrated = 0;
    let alreadyEncrypted = 0;

    for (const row of rows) {
      const config = { ...row.config };
      let changed = false;

      for (const field of SENSITIVE_FIELDS) {
        const value = config[field];
        if (typeof value === 'string') {
          if (value.startsWith(PREFIX)) {
            alreadyEncrypted++;
            continue;
          }
          config[`${field}_enc`] = encrypt(value, key);
          delete config[field];
          changed = true;
          console.log(`  [${row.type}] ${row.id}: encrypted field "${field}"`);
        }
      }

      if (changed) {
        await pool.query(
          'UPDATE integrations SET config = $1, updated_at = now() WHERE id = $2',
          [JSON.stringify(config), row.id],
        );
        migrated++;
      }
    }

    console.log(`\nDone. Migrated: ${migrated}, already encrypted: ${alreadyEncrypted}, unchanged: ${rows.length - migrated}.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
