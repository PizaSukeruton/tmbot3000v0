#!/bin/bash

# Add venue query pattern before personnel query
sed -i '' '/Check for "who is" queries first/i\
    // Check for venue-related queries\
    const venueQueryMatch = q.match(/(?:who is the |who'\''s the |what is the |what'\''s the )?venue (contact|manager|phone|email)/i);\
    if (venueQueryMatch) {\
      return {\
        intent_type: "venue_query",\
        confidence: 0.95,\
        entities: { query_type: venueQueryMatch[1].toLowerCase() }\
      };\
    }\
' backend/services/tmIntentMatcher.js

echo "✅ Added venue query pattern to tmIntentMatcher.js"
