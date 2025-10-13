#!/bin/bash

# Update getNextShow to skip travel days
sed -i '' '/async getNextShow() {/,/^    },/{
  s/return upcomingShows\[0\];/\/\/ Skip travel days and find the first actual show\
        for (const show of upcomingShows) {\
          if (show.show_time && show.show_time !== "") {\
            return show;\
          }\
        }\
        \
        \/\/ If all are travel days, return the first one anyway\
        return upcomingShows[0];/
}' backend/services/csvDataSource.js

echo "✅ Updated getNextShow to prefer actual shows over travel days"
