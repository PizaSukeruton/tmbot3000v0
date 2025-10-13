#!/bin/bash

# Add travel time pattern before the term lookup at the end
sed -i '' '/const termMatch = await this.lookupIndustryTerms(q);/i\
    // Check for travel time queries\
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
' backend/services/tmIntentMatcher.js

echo "✅ Added travel time pattern before term lookup"
