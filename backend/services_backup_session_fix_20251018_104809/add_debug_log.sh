#!/bin/bash

# Add debug logging right before the switch statement in tmAiEngine.js
sed -i '' '/switch (intent.intent_type) {/i\
      console.log("[DEBUG] Intent received:", JSON.stringify(intent));' backend/services/tmAiEngine.js

echo "✅ Added debug logging to tmAiEngine.js"
