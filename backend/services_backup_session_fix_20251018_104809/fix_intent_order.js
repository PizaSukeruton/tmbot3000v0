const fs = require('fs');

const filePath = 'backend/services/tmIntentMatcher.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find the try block and add location-specific pattern right after it
const tryIndex = content.indexOf('try {');
const firstIfIndex = content.indexOf('if (/', tryIndex);

if (tryIndex !== -1 && firstIfIndex !== -1) {
  const beforeIf = content.substring(0, firstIfIndex);
  const afterIf = content.substring(firstIfIndex);
  
  const locationPattern = `      // Check for location-specific queries first (before general show pattern)
      const locationSpecificMatch = q.match(/(?:the\\s+)?(\\w+)\\s+show(?:\\s+on\\s+(.+))?/i);
      if (locationSpecificMatch && locationSpecificMatch[1].toLowerCase() !== "the") {
        return {
          intent_type: "location_specific_query",
          confidence: 0.9,
          entities: { 
            location: locationSpecificMatch[1],
            date_string: locationSpecificMatch[2] || null
          }
        };
      }

      `;
  
  content = beforeIf + locationPattern + afterIf;
  fs.writeFileSync(filePath, content);
  console.log('✅ Added location-specific pattern before general patterns');
} else {
  console.error('Could not find the right location to insert pattern');
}
