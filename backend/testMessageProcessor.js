// testMessageProcessor.js
require('dotenv').config();
const pool = require('./db/pool');
const { generateHexId } = require('./utils/generateHexId');
const { createCsvDataSource } = require('./services/csvDataSource');
const TmAiEngine = require('./services/tmAiEngine');
const intentMatcher = require('./services/tmIntentMatcher');
const TmMessageProcessor = require('./services/tmMessageProcessor');

async function test() {
  console.log('Testing TmBot3000 Message Processor...\n');
  
  try {
    // 1. Create test member
    console.log('1. Creating test tour party member...');
    const memberId = await generateHexId('tour_party_id');
    await pool.query(`
      INSERT INTO tour_party (member_id, username, email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (username) DO UPDATE SET member_id = tour_party.member_id
      RETURNING member_id
    `, [memberId, 'test_user', 'test@tmbot.com', 'hash', 'Test User', 'tour_manager']);
    console.log(`   ✓ Created member: ${memberId}`);
    
    // 2. Initialize services
    console.log('\n2. Initializing services...');
    const dataSource = createCsvDataSource({ dataDir: process.env.TM_DATA_DIR || './data' });
    const aiEngine = await TmAiEngine.create({ dataSource });
    
    // 3. Create processor
    const processor = new TmMessageProcessor({
      pool,
      intentMatcher,
      aiEngine,
      generateHexId
    });
    console.log('   ✓ Services initialized');
    
    // 4. Test messages
    console.log('\n3. Testing conversation flow...');
    
    // First message - creates new session
    const result1 = await processor.processMessage({
      memberId,
      content: "What shows are coming up?"
    });
    console.log(`   ✓ Message 1: ${result1.success ? 'Success' : 'Failed'}`);
    if (result1.success) {
      console.log(`     Session: ${result1.data.sessionId}`);
      console.log(`     Response preview: ${result1.data.response.substring(0, 60)}...`);
    }
    
    // Second message - uses existing session
    const result2 = await processor.processMessage({
      sessionId: result1.data.sessionId,
      memberId,
      content: "Tell me about The Forum"
    });
    console.log(`   ✓ Message 2: ${result2.success ? 'Success' : 'Failed'}`);
    if (result2.success) {
      console.log(`     Intent: ${result2.data.intent}`);
      console.log(`     Response preview: ${result2.data.response.substring(0, 60)}...`);
    }
    
    // Third message - test soundcheck query
    const result3 = await processor.processMessage({
      sessionId: result1.data.sessionId,
      memberId,
      content: "When is soundcheck tomorrow?"
    });
    console.log(`   ✓ Message 3: ${result3.success ? 'Success' : 'Failed'}`);
    if (result3.success) {
      console.log(`     Intent: ${result3.data.intent}`);
      console.log(`     Entities:`, result3.data.entities);
    }
    
    console.log('\n✓ All tests completed!');
    
  } catch (err) {
    console.error('✗ Test failed:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

test();
