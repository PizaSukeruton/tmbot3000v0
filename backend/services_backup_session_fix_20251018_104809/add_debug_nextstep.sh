#!/bin/bash

# Add debug logging to assessContextNeed method
sed -i '' '/assessContextNeed(intent, query) {/a\
    console.log("[NEXTSTEP] Assessing context need for:", intent.intent_type, "in set?", this.contextDependentIntents.has(intent.intent_type));' backend/services/tmNextStepLogic.js

echo "✅ Added debug logging to Next Step Logic"
