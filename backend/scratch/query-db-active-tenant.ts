import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  
  console.log('--- LEAVE TYPES FOR TENANT 05cb23d9-16b7-4dde-8523-9f0e90f4bd5e ---');
  const lt = await client.query("SELECT * FROM leave_types WHERE tenant_id = '05cb23d9-16b7-4dde-8523-9f0e90f4bd5e'");
  console.log(lt.rows);

  await client.end();
}

main().catch(console.error);
