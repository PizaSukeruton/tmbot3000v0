#!/bin/bash

# Replace the location_specific_query handler with one that checks for pending queries
sed -i '' '/case "location_specific_query": {/,/^        }/c\
        case "location_specific_query": {\
          const location = intent.entities?.location;\
          const dateString = intent.entities?.date_string;\
          \
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
          const targetShow = matchingShows[0];\
          \
          // Check if this is a response to a pending query\
          const session = opt.session;\
          if (session?.pendingQuery?.originalIntent?.intent_type === "venue_query") {\
            // Get venue info for the specified show\
            const venue = await dataSource.getVenue(targetShow.venue_id);\
            if (!venue) {\
              return { type: "fallback", text: `I couldn'\''t find venue information for ${targetShow.venue_name}.` };\
            }\
            \
            // Clear the pending query\
            session.pendingQuery = null;\
            \
            // Return the venue contact info for Adelaide\
            return { \
              type: "venue_info", \
              text: `The venue contact for ${targetShow.venue_name} is ${venue.contact.name} - ${venue.contact.phone} (${venue.contact.email}).` \
            };\
          }\
          \
          return { \
            type: "location_confirmation", \
            text: `I found a show in ${targetShow.city} at ${targetShow.venue_name} on ${new Date(targetShow.date).toLocaleDateString()}. What would you like to know about this show?`\
          };\
        }' backend/services/tmAiEngine.js

echo "✅ Updated location_specific_query handler to check for pending queries"
