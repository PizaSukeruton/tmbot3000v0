#!/bin/bash
cd ~/TmBot3000/backend/services

echo "Backing up tmAiEngine.js..."
cp tmAiEngine.js tmAiEngine.js.backup_$(date +%Y%m%d_%H%M%S)

echo "Adding personnel_query handler..."
sed -i '' '/case "help":/,/case "show_schedule":/s/case "show_schedule": {/case "personnel_query": {\
          const personName = intent.entities?.person_name;\
          if (!personName) {\
            return { type: "personnel", text: "I need more information. Who are you asking about?" };\
          }\
          \
          const person = await dataSource.findPersonByName(personName);\
          if (!person) {\
            return { type: "personnel", text: `I couldn'\''t find information about ${personName}. You can ask about roles like FOH tech, guitar tech, drum tech, lighting tech, production manager, etc.` };\
          }\
          \
          if (person.name && person.role) {\
            return { type: "personnel", text: `The ${person.role} is ${person.name}.` };\
          } else if (person.name) {\
            return { type: "personnel", text: `${person.name} is part of the touring crew.` };\
          } else {\
            return { type: "personnel", text: `I found a ${person.role} in the production notes, but no specific name was listed.` };\
          }\
        }\
\
        case "show_schedule": {/' tmAiEngine.js

echo "Done! Checking if the handler was added..."
if grep -q "personnel_query" tmAiEngine.js; then
    echo "✅ Success! personnel_query handler has been added."
else
    echo "❌ Failed. Restoring backup..."
    cp tmAiEngine.js.backup_* tmAiEngine.js
fi
