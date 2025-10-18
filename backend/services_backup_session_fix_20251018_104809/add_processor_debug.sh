#!/bin/bash

# Add debug logging to message processor
sed -i '' '/intent = await this.intentMatcher.matchIntent/a\
      console.log("[MESSAGE-PROCESSOR] Matched intent:", JSON.stringify(intent));' backend/services/tmMessageProcessor.js

# Also add logging after the filter
sed -i '' '/const filteredData = await this.nextStepFilter.filter/a\
      console.log("[MESSAGE-PROCESSOR] Filtered data:", JSON.stringify(filteredData));' backend/services/tmMessageProcessor.js

echo "✅ Added debug logging to tmMessageProcessor.js"
