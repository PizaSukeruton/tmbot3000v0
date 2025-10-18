#!/bin/bash

# Add debug logging to hasAdequateContext method
sed -i '' '/hasAdequateContext(query, entities, sessionContext) {/a\
    console.log("[NEXTSTEP] Checking adequate context - query:", query, "entities:", entities, "sessionContext:", sessionContext);' backend/services/tmNextStepLogic.js

echo "✅ Added more debug logging to Next Step Logic"
