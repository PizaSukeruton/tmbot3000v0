#!/bin/bash

# Add handler for crew notification management to tmAiEngine.js
sed -i '' '/case "settings_management":/i\
        case "crew_notification_management": {\
          const action = intent.entities?.action; // enable/disable/toggle\
          const target = intent.entities?.target; // all/specific person\
          const eventType = intent.entities?.event_type;\
          \
          const crewNotifyManager = require("./tmCrewNotificationManager");\
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
            if (target === "all" || target === "everyone") {\
              // Bulk toggle\
              const enabled = action === "enable";\
              const result = await crewNotifyManager.bulkToggleNotifications(\
                context.show_id,\
                eventType,\
                enabled\
              );\
              \
              return {\
                type: "settings",\
                text: `${enabled ? "Enabled" : "Disabled"} ${eventType.replace(/_/g, " ")} notifications for ${result.affected} crew members.`\
              };\
            } else {\
              // Individual crew member\
              // This would need more logic to find the specific crew member\
              return {\
                type: "settings",\
                text: "To manage individual crew notifications, please specify their name or role."\
              };\
            }\
          } catch (err) {\
            console.error("[AI] Crew notification error:", err);\
            return { \
              type: "settings", \
              text: "Sorry, I couldn'\''t update the notification settings."\
            };\
          }\
        }\
\
' backend/services/tmAiEngine.js

echo "✅ Added crew notification handler"
