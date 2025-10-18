#!/bin/bash

# Add after venue_query handler
sed -i '' '/case "venue_query": {/,/^        }/!b; /^        }/a\
\
        case "location_specific_query": {\
          const location = intent.entities?.location;\
          const dateString = intent.entities?.date_string;\
          \
          // Find shows matching the location\
          const allShows = await dataSource.getShows();\
          const locationLower = location.toLowerCase();\
          const matchingShows = allShows.shows.filter(show => \
            show.city.toLowerCase().includes(locationLower) ||\
            show.venue_name.toLowerCase().includes(locationLower)\
          );\
          \
          if (matchingShows.length === 0) {\
            return { type: "fallback", text: `I couldn'\''t find any shows in ${location}.` };\
          }\
          \
          // Store the context for the matched show\
          const targetShow = matchingShows[0];\
          intent.context = {\
            show_id: targetShow.show_id,\
            venue_id: targetShow.venue_id,\
            venue_name: targetShow.venue_name,\
            date: targetShow.date,\
            city: targetShow.city\
          };\
          \
          // Now process the original pending query if any\
          const session = this.messageProcessor?.getSession?.(intent.member_id);\
          if (session?.pendingQuery) {\
            const originalIntent = session.pendingQuery.originalIntent;\
            originalIntent.context = intent.context;\
            return this.generateResponse({ ...originalIntent, context: intent.context });\
          }\
          \
          return { \
            type: "location_confirmation", \
            text: `I found a show in ${targetShow.city} at ${targetShow.venue_name} on ${new Date(targetShow.date).toLocaleDateString()}. What would you like to know about this show?`\
          };\
        }\
' backend/services/tmAiEngine.js

echo "✅ Added location-specific query handler"
