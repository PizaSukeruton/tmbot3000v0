#!/bin/bash

# Add detailed logging to hasAdequateContext
sed -i '' '/const hasTimeContext = this.contextIndicators.temporal.some/i\
    \
    // For venue_query, we need a specific venue context, not just the word "venue"\
    if (entities && entities.query_type && !entities.venue_id && !sessionContext.currentVenue) {\
      console.log("[NEXTSTEP] Query needs venue context but has none");\
      return false;\
    }' backend/services/tmNextStepLogic.js

echo "✅ Added specific venue context check"
