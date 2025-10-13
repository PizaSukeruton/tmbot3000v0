const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'tmAiEngine.js');
const content = fs.readFileSync(filePath, 'utf8');

// Find the end of personnel_query case
const personnelEndMatch = content.match(/case "personnel_query":[^}]*\}[\s\n]*\}/);
if (!personnelEndMatch) {
    console.error("Could not find personnel_query case");
    process.exit(1);
}

const insertPosition = personnelEndMatch.index + personnelEndMatch[0].length;

const venueHandler = `

        case "venue_query": {
          const queryType = intent.entities?.query_type || "contact";
          const context = intent.context || intent.assumedContext;
          
          if (!context || !context.venue_id) {
            return { type: "fallback", text: "Please specify which venue you're asking about." };
          }
          
          const venue = await dataSource.getVenue(context.venue_id);
          
          if (!venue) {
            return { type: "fallback", text: "I couldn't find information for that venue." };
          }
          
          let response = "";
          switch (queryType) {
            case "contact":
              response = \`The venue contact for \${venue.name} is \${venue.contact_name} - \${venue.contact_phone} (\${venue.contact_email}).\`;
              break;
            case "phone":
              response = \`The venue phone for \${venue.name} is \${venue.phone}.\`;
              break;
            case "email":
              response = \`The venue contact email for \${venue.name} is \${venue.contact_email}.\`;
              break;
            default:
              response = \`The venue contact for \${venue.name} is \${venue.contact_name} - \${venue.contact_phone}.\`;
          }
          
          return { type: "venue_info", text: response };
        }`;

const newContent = content.slice(0, insertPosition) + venueHandler + content.slice(insertPosition);
fs.writeFileSync(filePath, newContent);

console.log("✅ Added venue_query handler to tmAiEngine.js");
