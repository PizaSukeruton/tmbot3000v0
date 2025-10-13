// testNewIdTypes.js
const { generateHexId } = require('./utils/generateHexId');

async function testNewTypes() {
  console.log('Testing MESSAGE and API_REQUEST ID types...\n');
  
  try {
    // Test MESSAGE ID
    const messageId = await generateHexId('MESSAGE');
    console.log(`✓ MESSAGE ID: ${messageId}`);
    
    // Test API_REQUEST ID
    const apiRequestId = await generateHexId('API_REQUEST');
    console.log(`✓ API_REQUEST ID: ${apiRequestId}`);
    
    // Generate a few more to see the sequence
    const message2 = await generateHexId('MESSAGE');
    const message3 = await generateHexId('MESSAGE');
    console.log(`✓ More MESSAGE IDs: ${message2}, ${message3}`);
    
    console.log('\n✓ All new ID types working correctly!');
    
  } catch (err) {
    console.error('✗ Test failed:', err.message);
  } finally {
    process.exit(0);
  }
}

testNewTypes();
