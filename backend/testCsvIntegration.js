// testCsvIntegration.js
require('dotenv').config();
const { createCsvDataSource } = require('./services/csvDataSource');
const TmAiEngine = require('./services/tmAiEngine');

async function test() {
  console.log('Testing TmBot3000 CSV Integration...\n');
  
  try {
    // Create data source
    const dataSource = createCsvDataSource({
      dataDir: process.env.TM_DATA_DIR || './data'
    });
    
    // Test data source
    console.log('1. Testing CSV Data Source:');
    const shows = await dataSource.getShows({ upcoming: true });
    console.log(`   ✓ Found ${shows.shows.length} upcoming shows`);
    
    const venue = await dataSource.getVenue('#606001');
    console.log(`   ✓ Loaded venue: ${venue.name}`);
    
    // Create AI engine
    const aiEngine = await TmAiEngine.create({
      dataSource,
      defaultUserTimezone: 'America/New_York'
    });
    
    // Test AI responses
    console.log('\n2. Testing AI Engine:');
    
    // Test show schedule
    const response1 = await aiEngine.generateResponse({
      message: "What shows are coming up?",
      intent: { intent_type: 'show_schedule', entities: { upcoming: true } },
      member: { 
        role: 'tour_manager',
        timezone_preference: 'venue',
        user_timezone: 'America/New_York'
      }
    });
    console.log('   ✓ Show schedule response generated');
    console.log('   Sample:', response1.content.split('\n')[0]);
    
    // Test venue info
    const response2 = await aiEngine.generateResponse({
      message: "Tell me about venue #606001",
      intent: { intent_type: 'venue_info', entities: { venue_id: '#606001' } },
      member: { role: 'crew' }
    });
    console.log('   ✓ Venue info response generated');
    
    console.log('\n✓ All tests passed!');
    
  } catch (err) {
    console.error('✗ Test failed:', err.message);
    console.error(err.stack);
  }
}

test();
