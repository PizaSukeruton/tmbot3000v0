#!/bin/bash

# Find the line number where venue_query case ends
LINE=$(grep -n "return { type: \"venue_info\", text: response };" backend/services/tmAiEngine.js | head -1 | cut -d: -f1)
NEXT_LINE=$((LINE + 1))

# Insert the location_specific_query handler after venue_query
sed -i '' "${NEXT_LINE}a\\
\\
        case \"location_specific_query\": {\\
          const location = intent.entities?.location;\\
          const dateString = intent.entities?.date_string;\\
          \\
          const allShows = await dataSource.getShows();\\
          const locationLower = location.toLowerCase();\\
          const matchingShows = allShows.shows.filter(show => \\
            show.city.toLowerCase().includes(locationLower) ||\\
            show.venue_name.toLowerCase().includes(locationLower)\\
          );\\
          \\
          if (matchingShows.length === 0) {\\
            return { type: \"fallback\", text: \`I couldn't find any shows in \${location}.\` };\\
          }\\
          \\
          const targetShow = matchingShows[0];\\
          \\
          // Check if we have a pending venue query\\
          const session = this.messageProcessor?.sessions?.get(intent.member_id || \"test123\");\\
          if (session?.pendingQuery?.originalIntent?.intent_type === \"venue_query\") {\\
            // Get venue info for the Adelaide show\\
            const venue = await dataSource.getVenue(targetShow.venue_id);\\
            if (venue && venue.contact) {\\
              return { \\
                type: \"venue_info\", \\
                text: \`The venue contact for \${targetShow.venue_name} is \${venue.contact.name} - \${venue.contact.phone} (\${venue.contact.email}).\` \\
              };\\
            }\\
          }\\
          \\
          return { \\
            type: \"location_confirmation\", \\
            text: \`I found a show in \${targetShow.city} at \${targetShow.venue_name} on \${new Date(targetShow.date).toLocaleDateString()}. What would you like to know about this show?\`\\
          };\\
        }" backend/services/tmAiEngine.js

echo "✅ Added location_specific_query handler"
