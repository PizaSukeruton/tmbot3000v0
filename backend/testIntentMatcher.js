// testIntentMatcher.js
require('dotenv').config();
const intentMatcher = require('./services/tmIntentMatcher');

async function test() {
  console.log('Testing TmBot3000 Intent Matcher...\n');
  
  const testCases = [
    "Tell me about The Forum",
    "What shows are in Melbourne?",
    "When is soundcheck tomorrow?",
    "Show me the setlist for Sydney",
    "What time is load in at #606001?",
    "When do we fly to Brisbane?",
    "What's the venue address for the Sydney show?",
    "When is curfew tonight?",
    "Show me tomorrow's schedule"
  ];
  
  try {
    for (const message of testCases) {
      console.log(`Query: "${message}"`);
      const intent = await intentMatcher.matchIntent(message);
      console.log(`Intent: ${intent.intent_type} (confidence: ${intent.confidence})`);
      console.log(`Entities:`, intent.entities);
      console.log('---');
    }
    
    console.log('✓ Intent matcher is working!');
    
  } catch (err) {
    console.error('✗ Test failed:', err.message);
    console.error(err.stack);
  }
}

test();
