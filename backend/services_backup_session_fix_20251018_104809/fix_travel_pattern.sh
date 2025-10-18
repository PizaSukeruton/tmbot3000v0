#!/bin/bash

# Move travel time check BEFORE term lookup
sed -i '' '/Check for term lookup queries/,/^$/d' backend/services/tmIntentMatcher.js
sed -i '' '/Check for help query/a\
\
      // Check for travel time queries - MUST come before term lookup\
      const travelTimeMatch = q.match(/(?:how long|drive time|travel time|time to|duration|how far|when.*leave).*(?:venue|hotel|airport|show)/i);\
      if (travelTimeMatch) {\
        return {\
          intent_type: "travel_time_query",\
          confidence: 0.9,\
          entities: {\
            query_type: "duration"\
          }\
        };\
      }\
\
      // Check for term lookup queries\
      const termMatch = await this.lookupIndustryTerms(q);\
      if (termMatch) {\
        return termMatch;\
      }\
' backend/services/tmIntentMatcher.js

echo "✅ Fixed travel pattern priority"
