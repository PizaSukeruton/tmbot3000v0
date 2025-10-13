#!/bin/bash

# Fix the contextDependentIntents array
sed -i '' '/this.contextDependentIntents = new Set/,/]);/c\
    this.contextDependentIntents = new Set([\
      '\''venue_query'\'',\
      '\''travel_time_query'\'',\
      '\''personnel_query'\'',\
      '\''schedule_query'\'',\
      '\''location_query'\'',\
      '\''logistics_query'\''\
    ]);' backend/services/tmNextStepLogic.js

echo "✅ Fixed contextDependentIntents array"
