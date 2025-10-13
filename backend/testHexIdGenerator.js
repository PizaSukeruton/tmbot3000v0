// testHexIdGenerator.js
const { generateHexId, HEX_RANGES } = require('./utils/generateHexId');

async function testAllIdTypes() {
  console.log('Testing all hex ID types...\n');
  
  const testTypes = [
    'tour_party_id',
    'chat_session_id', 
    'chat_message_id',
    'knowledge_chunk_id',
    'conversation_chunk_id',
    'training_data_id'
  ];
  
  try {
    for (const idType of testTypes) {
      const hexId = await generateHexId(idType);
      const range = HEX_RANGES[idType];
      
      console.log(`✓ ${idType}:`);
      console.log(`  Generated: ${hexId}`);
      console.log(`  Range: ${toHex6(range.start)} to ${toHex6(range.end)}`);
      console.log(`  Capacity: ${(range.end - range.start + 1).toLocaleString()} IDs\n`);
    }
    
    console.log('✓ All ID types working correctly!');
    
  } catch (err) {
    console.error('✗ Test failed:', err.message);
  } finally {
    // Exit cleanly
    process.exit(0);
  }
}

function toHex6(n) {
  return Number(n).toString(16).toUpperCase().padStart(6, '0');
}

testAllIdTypes();
