import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();
  
  console.log('--- LEAVE TYPES ---');
  const lt = await client.query('SELECT id, tenant_id, name, code, is_active FROM leave_types');
  console.log(lt.rows);

  console.log('--- USERS ---');
  const users = await client.query('SELECT id, email, tenant_id, employee_id FROM users');
  console.log(users.rows);

  console.log('--- TEMPLATES ---');
  const templates = await client.query('SELECT id, name, template_type, is_default FROM templates');
  console.log(templates.rows);

  console.log('--- TEMPLATE ASSIGNMENTS ---');
  const assignments = await client.query('SELECT id, template_id, template_type, scope_type, scope_id FROM template_assignments');
  console.log(assignments.rows);

  await client.end();
}

main().catch(console.error);
