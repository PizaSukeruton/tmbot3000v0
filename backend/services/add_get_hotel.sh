#!/bin/bash

# Add getHotel method to csvDataSource.js
sed -i '' '/async getVenue(venueId)/i\
  async getHotel(showId) {\
    const hotelsFile = path.join(this.dataDir, "travel_hotels.csv");\
    const hotels = await this.loadCsv(hotelsFile);\
    \
    const hotel = hotels.find(h => h.show_id === showId);\
    return hotel || null;\
  },\
\
' backend/services/csvDataSource.js

echo "✅ Added getHotel method"
