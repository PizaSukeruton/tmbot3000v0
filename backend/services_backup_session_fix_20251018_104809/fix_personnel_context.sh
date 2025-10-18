#!/bin/bash

# Remove the previous fix
sed -i '' '/If personnel query already contains location, no context needed/,+3d' backend/services/tmNextStepLogic.js

# Add better context detection in hasAdequateContext
sed -i '' '/Check if query already contains location for personnel queries/,+4d' backend/services/tmNextStepLogic.js

# Add the improved check
sed -i '' '/const hasTimeContext = this.contextIndicators.temporal.some/i\
    // For personnel queries, check if location is already specified\
    if (intent.intent_type === "personnel_query") {\
      const locationPattern = /\\b(in|at|for)\\s+\\w+/i;\
      if (locationPattern.test(query)) {\
        console.log("[NEXTSTEP] Personnel query already has location context");\
        return true;\
      }\
    }\
' backend/services/tmNextStepLogic.js

echo "✅ Fixed personnel query context detection"
