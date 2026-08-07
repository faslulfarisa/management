import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from NestJS .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_hrms';
const backendUrl = 'http://localhost:3001/api/v1';

async function verifyZkteco() {
  console.log('--- STARTING ZKTECO END-TO-END VERIFICATION ---');
  console.log('Connecting to database:', dbUrl);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // 1. Get or create a Tenant
    let tenantId: string;
    const tenantRes = await client.query('SELECT id FROM tenants LIMIT 1');
    if (tenantRes.rows.length === 0) {
      console.log('Inserting mock tenant...');
      const insertTenant = await client.query(
        "INSERT INTO tenants (name, domain) VALUES ('ZK Test Resort', 'zktest.com') RETURNING id"
      );
      tenantId = insertTenant.rows[0].id;
    } else {
      tenantId = tenantRes.rows[0].id;
    }
    console.log('Using Tenant ID:', tenantId);

    // 2. Get or create a Property
    let propertyId: string;
    const propRes = await client.query('SELECT id FROM properties WHERE tenant_id = $1 LIMIT 1', [tenantId]);
    if (propRes.rows.length === 0) {
      console.log('Inserting mock property...');
      const insertProp = await client.query(
        'INSERT INTO properties (tenant_id, name, code) VALUES ($1, $2, $3) RETURNING id',
        [tenantId, 'Main Building', 'MAIN']
      );
      propertyId = insertProp.rows[0].id;
    } else {
      propertyId = propRes.rows[0].id;
    }

    // 3. Ensure employee EMP999 exists
    const employeeCode = 'EMP999';
    let employeeId: string;
    const empRes = await client.query(
      'SELECT id FROM employees WHERE tenant_id = $1 AND employee_code = $2',
      [tenantId, employeeCode]
    );

    if (empRes.rows.length === 0) {
      console.log(`Inserting mock employee '${employeeCode}'...`);
      const insertEmp = await client.query(
        `INSERT INTO employees (
          tenant_id, employee_code, first_name, last_name, date_of_joining, property_id
        ) VALUES ($1, $2, $3, $4, now(), $5) RETURNING id`,
        [tenantId, employeeCode, 'Alex', 'Bio-Tester', propertyId]
      );
      employeeId = insertEmp.rows[0].id;
    } else {
      employeeId = empRes.rows[0].id;
    }
    console.log(`Employee '${employeeCode}' resolved to ID:`, employeeId);

    // 4. Ensure we have an active ZKTeco integration for SN 'ZKTEST99999'
    const deviceSn = 'ZKTEST99999';
    await client.query(
      'DELETE FROM integrations WHERE tenant_id = $1 AND type = $2',
      [tenantId, 'zkteco']
    );

    console.log(`Creating active integration for ZKTeco SN: '${deviceSn}'...`);
    const intRes = await client.query(
      `INSERT INTO integrations (tenant_id, name, type, config, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [tenantId, 'ZK Lobby terminal', 'zkteco', JSON.stringify({ device_sn: deviceSn })]
    );
    const integrationId = intRes.rows[0].id;
    console.log('Created Integration ID:', integrationId);

    // 5. Mock ZKTeco ADMS GET Handshake Request
    console.log('\n--- 1. Testing ZKTeco ADMS Handshake (GET CDATA) ---');
    const handshakeUrl = `${backendUrl}/integrations/zkteco/iclock/cdata?SN=${deviceSn}`;
    console.log('Sending GET request to:', handshakeUrl);
    
    const getRes = await fetch(handshakeUrl);
    const getResText = await getRes.text();
    console.log('Response Status:', getRes.status);
    console.log('Response Body:\n', getResText);

    if (getRes.status === 200 && getResText.includes('OK')) {
      console.log('✅ Handshake verification SUCCESS!');
    } else {
      throw new Error('❌ Handshake verification FAILED');
    }

    // 6. Mock ZKTeco ADMS POST Punch log upload
    console.log('\n--- 2. Testing ZKTeco ADMS Log Push (POST CDATA) ---');
    const punchPushUrl = `${backendUrl}/integrations/zkteco/iclock/cdata?SN=${deviceSn}&table=ATTLOG`;
    const mockAttlogsText = 
      `${employeeCode}\t2026-05-23 09:15:00\t0\t0\t0\t0\n` +
      `${employeeCode}\t2026-05-23 17:45:00\t0\t0\t0\t0\n`;
    
    console.log('Pushing raw logs text:\n', mockAttlogsText);
    const postRes = await fetch(punchPushUrl, {
      method: 'POST',
      body: mockAttlogsText,
      headers: { 'Content-Type': 'text/plain' }
    });
    const postResText = await postRes.text();
    console.log('Response Status:', postRes.status);
    console.log('Response Body:', postResText);

    if (postRes.status === 200 && postResText.includes('OK: 2')) {
      console.log('✅ Log Push verification SUCCESS!');
    } else {
      throw new Error('❌ Log Push verification FAILED');
    }

    // 7. Verify attendance record is written in database
    console.log('\n--- 3. Verifying Database Attendance Records ---');
    const attRecs = await client.query(
      'SELECT * FROM attendance_records WHERE tenant_id = $1 AND employee_id = $2 AND date = $3',
      [tenantId, employeeId, '2026-05-23']
    );

    if (attRecs.rows.length > 0) {
      const rec = attRecs.rows[0];
      console.log('✅ Found Mapped Attendance Record:');
      console.log(' - Date:', rec.date.toISOString().split('T')[0]);
      console.log(' - Clock In:', rec.clock_in.toISOString());
      console.log(' - Clock Out:', rec.clock_out.toISOString());
      console.log(' - Status:', rec.status);
      console.log(' - Remarks:', rec.remarks);
    } else {
      throw new Error('❌ No attendance record found in database!');
    }

    // 8. Verify Sync log exists
    const syncLogs = await client.query(
      'SELECT * FROM sync_logs WHERE tenant_id = $1 AND integration_id = $2 ORDER BY started_at DESC LIMIT 1',
      [tenantId, integrationId]
    );

    if (syncLogs.rows.length > 0) {
      console.log('✅ Found Sync Log record matching ZKTeco:');
      console.log(' - Records Synced:', syncLogs.rows[0].records_synced);
      console.log(' - Sync Status:', syncLogs.rows[0].status);
    } else {
      throw new Error('❌ No sync log record found in database!');
    }

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULY!');

  } catch (err: any) {
    console.error('\n❌ VERIFICATION TEST ERROR:', err.message);
  } finally {
    await client.end();
    console.log('Disconnected from database.');
  }
}

verifyZkteco();
