// testConnection.js
const pool = require('./db/pool');

async function testConnection() {
  console.log('Testing database connection...');
  
  try {
    const client = await pool.connect();
    console.log('✓ Connected to database');
    
    // Test basic query
    const result = await client.query('SELECT NOW()');
    console.log('✓ Current time from database:', result.rows[0].now);
    
    // Check our tables exist
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n✓ Tables in database:');
    tables.rows.forEach(row => console.log('  -', row.table_name));
    
    client.release();
    console.log('\n✓ Connection test successful!');
    
  } catch (err) {
    console.error('✗ Connection test failed:', err.message);
  } finally {
    await pool.end();
  }
}

testConnection();
