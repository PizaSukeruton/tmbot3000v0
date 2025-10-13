#!/bin/bash

# Update the personnel_query handler to check for multiple matches
sed -i '' '/case "personnel_query": {/,/^        }/c\
        case "personnel_query": {\
          const personName = intent.entities?.person_name;\
          if (!personName) {\
            return { type: "personnel", text: "I need more information. Who are you asking about?" };\
          }\
          \
          // Check if this role exists in multiple shows\
          const allMatches = await dataSource.checkPersonnelAcrossShows(personName);\
          \
          if (allMatches.length === 0) {\
            return { type: "personnel", text: `I couldn'\''t find information about ${personName}. You can ask about roles like FOH tech, guitar tech, drum tech, lighting tech, production manager, etc.` };\
          }\
          \
          // If only one match across all shows, return it directly\
          if (allMatches.length === 1) {\
            const person = allMatches[0];\
            return { type: "personnel", text: `The ${person.role} is ${person.name} - contact: ${person.contact}.` };\
          }\
          \
          // Multiple matches - check if we have context\
          const context = intent.context || intent.assumedContext;\
          if (context && context.show_id) {\
            // Find the match for the specific show\
            const showMatch = allMatches.find(p => p.show_id === context.show_id);\
            if (showMatch) {\
              return { type: "personnel", text: `The ${showMatch.role} for this show is ${showMatch.name} - contact: ${showMatch.contact}.` };\
            }\
          }\
          \
          // Multiple matches but no context - this should trigger Next Step Logic\
          return { type: "personnel", text: `I found ${allMatches.length} different ${personName}s across the tour. Which show are you asking about?` };\
        }' backend/services/tmAiEngine.js

echo "✅ Updated personnel_query handler"
