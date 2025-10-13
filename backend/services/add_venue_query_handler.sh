#!/bin/bash

# Find the location after personnel_query case and add venue_query handler
sed -i '' '/case "personnel_query": {/,/^        }/!b; /^        }/a\
\
        case "venue_query": {\
          const queryType = intent.entities?.query_type || "contact";\
          const context = intent.context || intent.assumedContext;\
          \
          if (!context || !context.venue_id) {\
            return { type: "fallback", text: "Please specify which venue you'\''re asking about." };\
          }\
          \
          const csvDataSource = require("./csvDataSource").createCsvDataSource({ dataDir: path.join(__dirname, "..", "data") });\
          const venue = await csvDataSource.getVenue(context.venue_id);\
          \
          if (!venue) {\
            return { type: "fallback", text: "I couldn'\''t find information for that venue." };\
          }\
          \
          let response = "";\
          switch (queryType) {\
            case "contact":\
              response = `The venue contact for ${venue.name} is ${venue.contact_name} - ${venue.contact_phone} (${venue.contact_email}).`;\
              break;\
            case "phone":\
              response = `The venue phone for ${venue.name} is ${venue.phone}.`;\
              break;\
            case "email":\
              response = `The venue contact email for ${venue.name} is ${venue.contact_email}.`;\
              break;\
            default:\
              response = `The venue contact for ${venue.name} is ${venue.contact_name} - ${venue.contact_phone}.`;\
          }\
          \
          return { type: "venue_info", text: response };\
        }
' backend/services/tmAiEngine.js

echo "✅ Added venue_query handler to tmAiEngine.js"
