#!/bin/bash
cd ~/TmBot3000/backend/services

echo "Backing up tmIntentMatcher.js..."
cp tmIntentMatcher.js tmIntentMatcher.js.backup_$(date +%Y%m%d_%H%M%S)

echo "Adding 'who is' pattern to intent matcher..."
sed -i '' '/let intent = { intent_type: null, confidence: 0, entities: {} };/a\
\
    // Check for "who is" queries first\
    const whoIsMatch = q.match(/who\\s+is\\s+(?:the\\s+)?(.+?)\\??$/i);\
    if (whoIsMatch) {\
      return {\
        intent_type: "personnel_query",\
        confidence: 0.95,\
        entities: { person_name: whoIsMatch[1].trim() }\
      };\
    }\
' tmIntentMatcher.js

echo "Done! Checking if the pattern was added..."
if grep -q "personnel_query" tmIntentMatcher.js; then
    echo "✅ Success! 'who is' pattern has been added."
else
    echo "❌ Failed. Restoring backup..."
    cp tmIntentMatcher.js.backup_* tmIntentMatcher.js
fi
