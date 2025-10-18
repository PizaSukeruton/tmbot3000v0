#!/bin/bash

# Add individual member handling to the AI engine
sed -i '' '/case "crew_notification_management":/i\
        case "individual_notification_management": {\
          const action = intent.entities?.action;\
          const memberName = intent.entities?.member_name;\
          const eventType = intent.entities?.event_type;\
          \
          const memberNotifyManager = require("./tmMemberNotificationManager");\
          const context = intent.context || intent.assumedContext;\
          \
          if (!context?.show_id) {\
            return { \
              type: "settings", \
              text: "I need to know which show you want to manage notifications for."\
            };\
          }\
          \
          try {\
            // Find the member\
            const members = await memberNotifyManager.findMember(context.show_id, memberName);\
            \
            if (members.length === 0) {\
              return {\
                type: "settings",\
                text: `I couldn'\''t find anyone named "${memberName}" in the touring party.`\
              };\
            }\
            \
            if (members.length > 1) {\
              // Multiple matches - ask for clarification\
              const memberList = members.map(m => `${m.name} (${m.role})`).join(", ");\
              return {\
                type: "settings",\
                text: `I found multiple people: ${memberList}. Please be more specific.`\
              };\
            }\
            \
            // Single match - update their settings\
            const member = members[0];\
            const result = await memberNotifyManager.toggleMemberNotification(\
              member.notification_id,\
              eventType\
            );\
            \
            if (result.success) {\
              return {\
                type: "settings",\
                text: `${result.newValue ? "Enabled" : "Disabled"} ${eventType.replace(/notify_on_|_/g, " ")} notifications for ${result.member} (${result.role}).`\
              };\
            } else {\
              return {\
                type: "settings",\
                text: result.error || "Failed to update notification settings."\
              };\
            }\
          } catch (err) {\
            console.error("[AI] Individual notification error:", err);\
            return { \
              type: "settings", \
              text: "Sorry, I couldn'\''t update the individual notification settings."\
            };\
          }\
        }\
\
' backend/services/tmAiEngine.js

echo "✅ Added individual notification handler"
