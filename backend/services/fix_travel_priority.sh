#!/bin/bash

# First, remove the existing travel time check
sed -i '' '/Check for travel time queries/,+8d' backend/services/tmIntentMatcher.js

# Now add it right after the "where is" check and before the term lookup
sed -i '' '/const whereIsMatch = q.match/,/^    }/a\
\
    // Check for travel time queries BEFORE term lookup\
    if (/(?:how long|drive time|travel time|time to|duration|how far|when.*leave).*(?:venue|hotel|airport|show)/i.test(q)) {\
      return {\
        intent_type: "travel_time_query",\
        confidence: 0.9,\
        entities: {\
          query_type: "duration"\
        }\
      };\
    }\
' backend/services/tmIntentMatcher.js

echo "✅ Moved travel time check before term lookup"
