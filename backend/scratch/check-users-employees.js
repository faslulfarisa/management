require('dotenv').config({ path: __dirname + '/../.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const users = await pool.query('SELECT id, employee_id, email FROM users LIMIT 5');
  console.log('Users:');
  console.log(users.rows);

  const employees = await pool.query('SELECT id, employee_code, first_name FROM employees LIMIT 5');
  console.log('Employees:');
  console.log(employees.rows);

  await pool.end();
}
main().catch(console.error);
