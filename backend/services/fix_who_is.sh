#!/bin/bash
cd ~/TmBot3000/backend/services

echo "Backing up csvDataSource.js..."
cp csvDataSource.js csvDataSource.js.backup_$(date +%Y%m%d_%H%M%S)

echo "Adding findPersonByName method..."
sed -i '' '/async getFlightsByDestination(city) {/,/},/s/},$/},\
\
    async findPersonByName(name) {\
      console.log(`[CSV-DATA-SOURCE] Finding person by name: "${name}"`);\
      \
      try {\
        const normalizedQuery = name.toLowerCase().trim();\
        \
        for (const row of prodNotes) {\
          if (row.category === '\''crew'\'' && row.note) {\
            const match = row.note.match(\/^(.+?):\\s*(.+?)\\s*-\\s*contact\\s*(.+)$\/i);\
            \
            if (match) {\
              const [_, role, personName, contact] = match;\
              const normalizedRole = role.toLowerCase().trim();\
              const normalizedPersonName = personName.toLowerCase().trim();\
              \
              if (normalizedRole === normalizedQuery || \
                  normalizedRole.includes(normalizedQuery) ||\
                  normalizedQuery.includes(normalizedRole) ||\
                  normalizedPersonName.includes(normalizedQuery) ||\
                  normalizedQuery.includes(normalizedPersonName)) {\
                return {\
                  role: role.trim(),\
                  name: personName.trim(),\
                  contact: contact.trim(),\
                  show_id: row.show_id,\
                  priority: row.priority\
                };\
              }\
            }\
          }\
        }\
        \
        return null;\
      } catch (err) {\
        console.error('\''[CSV-DATA-SOURCE] Error finding person:'\'', err);\
        return null;\
      }\
    },/' csvDataSource.js

echo "Done! Testing if the method was added..."
if grep -q "findPersonByName" csvDataSource.js; then
    echo "✅ Success! findPersonByName method has been added."
else
    echo "❌ Failed. Restoring backup..."
    cp csvDataSource.js.backup_* csvDataSource.js
fi
