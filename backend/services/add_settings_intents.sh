#!/bin/bash

# Add settings management intent patterns to tmIntentMatcher.js
sed -i '' '/Check for travel time queries/i\
    // Check for settings management queries\
    if (/(?:turn on|turn off|enable|disable|toggle).*(?:traffic|monitoring|auto.?adjust|notification)/i.test(q)) {\
      const enableMatch = /turn on|enable/.test(q);\
      const disableMatch = /turn off|disable/.test(q);\
      return {\
        intent_type: "settings_management",\
        confidence: 0.9,\
        entities: {\
          action: enableMatch ? "enable" : (disableMatch ? "disable" : "toggle"),\
          feature: q.match(/(?:traffic monitoring|auto.?adjust|notification)/i)?.[0]\
        }\
      };\
    }\
\
    // Check for settings status queries\
    if (/(?:show|what are|check).*(?:settings|preferences|configuration)/i.test(q)) {\
      return {\
        intent_type: "settings_query",\
        confidence: 0.9,\
        entities: {}\
      };\
    }\
\
' backend/services/tmIntentMatcher.js

echo "✅ Added settings intent patterns"
