#!/bin/bash
cd ~/TmBot3000/backend/services

echo "Backing up tmIntentMatcher.js..."
cp tmIntentMatcher.js tmIntentMatcher.js.backup_where

echo "Adding 'where is' pattern to intent matcher..."
sed -i '' '/const whoIsMatch = q.match/,/}/s/}/}\
\
    const whereIsMatch = q.match(\/where\\s+is\\s+(?:the\\s+)?(.+?)\\??$\/i);\
    if (whereIsMatch) {\
      return {\
        intent_type: "location_query",\
        confidence: 0.95,\
        entities: { location_name: whereIsMatch[1].trim() }\
      };\
    }/' tmIntentMatcher.js

echo "Done! Checking if the pattern was added..."
if grep -q "location_query" tmIntentMatcher.js; then
    echo "✅ Success! 'where is' pattern has been added."
else
    echo "❌ Failed. Restoring backup..."
    cp tmIntentMatcher.js.backup_where tmIntentMatcher.js
fi
