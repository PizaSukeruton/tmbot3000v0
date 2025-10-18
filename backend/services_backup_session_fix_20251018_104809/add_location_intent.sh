#!/bin/bash

# Add location-specific query pattern after the venue query pattern
sed -i '' '/const venueQueryMatch = q.match/,/}/!b; /}/a\
\
    // Check for location-specific queries\
    const locationSpecificMatch = q.match(/(?:the\\s+)?(\\w+)\\s+show(?:\\s+on\\s+(.+))?/i);\
    if (locationSpecificMatch) {\
      return {\
        intent_type: "location_specific_query",\
        confidence: 0.9,\
        entities: { \
          location: locationSpecificMatch[1],\
          date_string: locationSpecificMatch[2] || null\
        }\
      };\
    }\
' backend/services/tmIntentMatcher.js

echo "✅ Added location-specific query pattern"
