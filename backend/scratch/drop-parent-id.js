const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  console.log('Connected');
  await client.query('ALTER TABLE tasks DROP COLUMN IF EXISTS parent_id CASCADE;');
  console.log('Dropped parent_id');
  await client.end();
}

run().catch(console.error);
