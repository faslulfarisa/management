import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  
  console.log('--- TARGET EMPLOYEE ---');
  const emp = await client.query("SELECT * FROM employees WHERE id = '092aabc3-fe0e-4338-8359-1eb5834f83a3'");
  console.log(emp.rows);

  console.log('--- LEAVE POLICY TEMPLATES ---');
  const t = await client.query("SELECT id, name, config FROM templates WHERE template_type = 'leave_policy'");
  console.log(JSON.stringify(t.rows, null, 2));

  console.log('--- LEAVE TYPES FOR TENANT ---');
  const lt = await client.query("SELECT * FROM leave_types WHERE tenant_id = 'a2a7c477-8fcb-4c75-9b02-22fde2518f76'");
  console.log(lt.rows);

  await client.end();
}

main().catch(console.error);
