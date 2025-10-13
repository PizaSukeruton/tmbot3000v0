#!/bin/bash

# Backup the file first
cp backend/services/tmAiEngine.js backend/services/tmAiEngine.js.backup_venue

# Find line 499 and insert the venue_query handler before it
awk '
NR==499 {
    print ""
    print "        case \"venue_query\": {"
    print "          const queryType = intent.entities?.query_type || \"contact\";"
    print "          const context = intent.context || intent.assumedContext;"
    print "          "
    print "          if (!context || !context.venue_id) {"
    print "            return { type: \"fallback\", text: \"Please specify which venue you'\''re asking about.\" };"
    print "          }"
    print "          "
    print "          const venue = await dataSource.getVenue(context.venue_id);"
    print "          "
    print "          if (!venue) {"
    print "            return { type: \"fallback\", text: \"I couldn'\''t find information for that venue.\" };"
    print "          }"
    print "          "
    print "          let response = \"\";"
    print "          switch (queryType) {"
    print "            case \"contact\":"
    print "              response = `The venue contact for ${venue.name} is ${venue.contact_name} - ${venue.contact_phone} (${venue.contact_email}).`;"
    print "              break;"
    print "            case \"phone\":"
    print "              response = `The venue phone for ${venue.name} is ${venue.phone}.`;"
    print "              break;"
    print "            case \"email\":"
    print "              response = `The venue contact email for ${venue.name} is ${venue.contact_email}.`;"
    print "              break;"
    print "            default:"
    print "              response = `The venue contact for ${venue.name} is ${venue.contact_name} - ${venue.contact_phone}.`;"
    print "          }"
    print "          "
    print "          return { type: \"venue_info\", text: response };"
    print "        }"
    print ""
}
{print}
' backend/services/tmAiEngine.js > backend/services/tmAiEngine.js.tmp && mv backend/services/tmAiEngine.js.tmp backend/services/tmAiEngine.js

echo "✅ Added venue_query handler to tmAiEngine.js"
