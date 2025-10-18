#!/bin/bash

sed -i '' '/async getNextShow() {/,/^    },/{
  s/if (!this\.data || !this\.data\.shows) {/if (!shows || shows.length === 0) {/
  s/await this\.loadData();/return null;/
  s/this\.data\.shows/shows/g
}' backend/services/csvDataSource.js

echo "✅ Fixed getNextShow to use correct shows reference"
