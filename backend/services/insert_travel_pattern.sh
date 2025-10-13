#!/bin/bash

# Add travel time pattern before the general patterns
sed -i '' '/if.*schedule|showtime|what time.*show/i\
      // Check for travel time queries\
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

echo "✅ Inserted travel time pattern"
