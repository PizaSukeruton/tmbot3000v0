#!/bin/bash

sed -i '' '/async getNextShow() {/,/^    },/{
  s/if (!this\.data\.shows) {/if (!this.data || !this.data.shows) {/
}' backend/services/csvDataSource.js

echo "✅ Fixed getNextShow data loading check"
