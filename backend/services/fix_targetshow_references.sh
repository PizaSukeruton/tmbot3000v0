#!/bin/bash

# Remove all the invalid session context update blocks that reference targetShow
# These are the blocks that start with "if (session) {" and contain targetShow references

sed -i '' '/if (session) {/,/^            }/d' backend/services/tmAiEngine.js

# But we need to keep the valid one in location_specific_query where targetShow is actually defined
# Let's add it back after we find where targetShow is defined
sed -i '' '/const targetShow = matchingShows\[0\];/a\
\
          // Update session context for future queries\
          if (session) {\
            session.context = {\
              show_id: targetShow.show_id,\
              venue_id: targetShow.venue_id,\
              venue_name: targetShow.venue_name,\
              city: targetShow.city,\
              date: targetShow.date\
            };\
          }' backend/services/tmAiEngine.js

echo "✅ Fixed targetShow references"
