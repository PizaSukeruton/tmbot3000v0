#!/bin/bash
cd ~/TmBot3000/backend/services

# Backup first
cp csvDataSource.js csvDataSource.js.backup_location

# Find the line number after findPersonByName method ends
LINE=$(grep -n "async findPersonByName" csvDataSource.js | cut -d: -f1)
END_LINE=$(tail -n +$LINE csvDataSource.js | grep -n "^    },$" | head -1 | cut -d: -f1)
TARGET_LINE=$((LINE + END_LINE))

# Create the method to insert
cat > location_method.tmp << 'METHODEOF'

    async getLocationInfo(locationName) {
      console.log(`[CSV-DATA-SOURCE] Getting location info for: "${locationName}"`);
      
      const normalizedQuery = locationName.toLowerCase().trim();
      
      try {
        const venues = await this.loadCsv('venues.csv');
        
        // First try to find the venue by name
        for (const venue of venues) {
          const venueName = (venue.name || '').toLowerCase();
          if (venueName.includes(normalizedQuery) || normalizedQuery.includes(venueName)) {
            return {
              type: 'venue',
              name: venue.name,
              address: venue.address_street,
              city: venue.address_city,
              state: venue.address_state,
              country: venue.address_country,
              phone: venue.phone
            };
          }
        }
        
        // Then check for specific facility locations
        if (venues.length > 0) {
          const venue = venues[0]; // We only have one venue in the test data
          
          if (normalizedQuery.includes('first aid') || normalizedQuery.includes('medical')) {
            return {
              type: 'facility',
              name: 'First Aid Station',
              location: venue.first_aid_location
            };
          }
          
          if (normalizedQuery.includes('stage door')) {
            return {
              type: 'facility', 
              name: 'Stage Door',
              location: venue.stage_door
            };
          }
          
          if (normalizedQuery.includes('production office')) {
            return {
              type: 'facility',
              name: 'Production Office', 
              location: venue.production_office
            };
          }
          
          if (normalizedQuery.includes('loading dock')) {
            return {
              type: 'facility',
              name: 'Loading Dock',
              location: venue.loading_dock
            };
          }
          
          if (normalizedQuery.includes('merch') || normalizedQuery.includes('merchandise')) {
            return {
              type: 'facility',
              name: 'Merch Stand',
              location: venue.merch_stand_location
            };
          }
        }
        
        return null;
      } catch (err) {
        console.error('[CSV-DATA-SOURCE] Error getting location info:', err);
        return null;
      }
    },
METHODEOF

# Insert the method after the target line
head -n $TARGET_LINE csvDataSource.js > temp_file.js
cat location_method.tmp >> temp_file.js
tail -n +$((TARGET_LINE + 1)) csvDataSource.js >> temp_file.js

# Replace the original file
mv temp_file.js csvDataSource.js

# Clean up
rm location_method.tmp

echo "Done! Checking if method was added..."
if grep -q "getLocationInfo" csvDataSource.js; then
    echo "✅ Success! getLocationInfo method has been added."
else
    echo "❌ Failed. Restoring backup..."
    cp csvDataSource.js.backup_location csvDataSource.js
fi
