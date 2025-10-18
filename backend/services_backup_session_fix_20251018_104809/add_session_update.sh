#!/bin/bash

# Add session context update to location_specific_query handler
sed -i '' '/return {/i\
          // Update session context for future queries\
          if (session) {\
            session.context = {\
              show_id: targetShow.show_id,\
              venue_id: targetShow.venue_id,\
              venue_name: targetShow.venue_name,\
              city: targetShow.city,\
              date: targetShow.date\
            };\
          }\
' backend/services/tmAiEngine.js

echo "✅ Added session context update to location_specific_query handler"
