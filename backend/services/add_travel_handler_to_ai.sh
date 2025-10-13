#!/bin/bash

# Find where the switch statement for intent types is and add travel_time_query handler
sed -i '' '/case "location_specific_query":/i\
        case "travel_time_query": {\
          const context = intent.context || intent.assumedContext;\
          \
          if (!context || !context.venue_id) {\
            return { \
              type: "travel_info", \
              text: "I need to know which show you'\''re asking about to calculate travel time."\
            };\
          }\
          \
          try {\
            // Get venue and hotel info\
            const venue = await dataSource.getVenue(context.venue_id);\
            if (!venue) {\
              return { type: "travel_info", text: "I couldn'\''t find venue information." };\
            }\
            \
            const hotel = await dataSource.getHotel(context.show_id);\
            if (!hotel) {\
              return { type: "travel_info", text: "I couldn'\''t find hotel information for this show." };\
            }\
            \
            const hotelAddress = hotel.address;\
            const venueAddress = `${venue.address}, ${venue.city}, ${venue.state}`;\
            \
            const result = await mapsService.getTravelTime(hotelAddress, venueAddress);\
            \
            if (result.error) {\
              return { type: "travel_info", text: `Unable to calculate travel time: ${result.error}` };\
            }\
            \
            const duration = result.durationInTraffic || result.duration;\
            const minutes = Math.round(duration.value / 60);\
            \
            return {\
              type: "travel_info",\
              text: `Current travel time from ${hotel.name} to ${venue.name} is ${minutes} minutes.`\
            };\
          } catch (err) {\
            console.error("[AI] Travel query error:", err);\
            return { type: "travel_info", text: "Sorry, I couldn'\''t calculate the travel time." };\
          }\
        }\
\
' backend/services/tmAiEngine.js

echo "✅ Added travel_time_query handler to AI engine"
