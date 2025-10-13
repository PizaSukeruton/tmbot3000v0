#!/bin/bash

# Add getNextShow method to csvDataSource.js

# Find the line with the closing brace of the return statement
# and insert the new method before it

sed -i.tmp '/^  };$/i\
\
    // Get the next upcoming show\
    async getNextShow() {\
      try {\
        if (!this.data.shows) {\
          await this.loadData();\
        }\
\
        const now = new Date();\
        \
        // Sort shows by date and find the next one\
        const upcomingShows = this.data.shows\
          .filter(show => {\
            const showDate = new Date(show.date);\
            return showDate >= now;\
          })\
          .sort((a, b) => new Date(a.date) - new Date(b.date));\
\
        if (upcomingShows.length === 0) {\
          return null;\
        }\
\
        return upcomingShows[0];\
      } catch (error) {\
        console.error('\''Error getting next show:'\'', error);\
        return null;\
      }\
    },' backend/services/csvDataSource.js

echo "✅ Added getNextShow method to csvDataSource.js"
