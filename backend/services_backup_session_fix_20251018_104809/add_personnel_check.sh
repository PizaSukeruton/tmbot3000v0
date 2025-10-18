#!/bin/bash

# Add method to check if personnel role exists in multiple shows
sed -i '' '/async findPersonByName(name) {/i\
    async checkPersonnelAcrossShows(roleName) {\
      console.log(`[CSV-DATA-SOURCE] Checking if ${roleName} exists in multiple shows`);\
      \
      try {\
        const normalizedQuery = roleName.toLowerCase().trim();\
        const matchingRoles = new Map();\
        \
        for (const row of prodNotes) {\
          if (row.category === '\''crew'\'' && row.note) {\
            const match = row.note.match(/^(.+?):\\s*(.+?)\\s*-\\s*contact\\s*(.+)$/i);\
            \
            if (match) {\
              const [_, role, personName, contact] = match;\
              const normalizedRole = role.toLowerCase().trim();\
              \
              if (normalizedRole === normalizedQuery || \
                  normalizedRole.includes(normalizedQuery) ||\
                  normalizedQuery.includes(normalizedRole)) {\
                if (!matchingRoles.has(row.show_id)) {\
                  matchingRoles.set(row.show_id, {\
                    role: role.trim(),\
                    name: personName.trim(),\
                    contact: contact.trim(),\
                    show_id: row.show_id\
                  });\
                }\
              }\
            }\
          }\
        }\
        \
        return Array.from(matchingRoles.values());\
      } catch (err) {\
        console.error('\''[CSV-DATA-SOURCE] Error checking personnel across shows:'\''<String
        return [];\
      }\
    },\
\
' backend/services/csvDataSource.js

echo "✅ Added checkPersonnelAcrossShows method"
