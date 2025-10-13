#!/bin/bash

# Update location_specific_query to return context with the response
sed -i '' '/type: "location_confirmation",/a\
            context: {\
              show_id: targetShow.show_id,\
              venue_id: targetShow.venue_id,\
              venue_name: targetShow.venue_name,\
              city: targetShow.city,\
              date: targetShow.date\
            },' backend/services/tmAiEngine.js

echo "✅ Updated location_specific_query to return context"
