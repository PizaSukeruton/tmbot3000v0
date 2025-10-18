#!/bin/bash

# Fix the dataDir issue in tmMessageProcessor.js

sed -i.tmp 's/this.csvDataSource = createCsvDataSource();/this.csvDataSource = createCsvDataSource({ dataDir: path.join(__dirname, '\''..'\''', '\'data\'') });/' backend/services/tmMessageProcessor.js

# Also need to add the path import at the top
sed -i.tmp '/const NextStepLogicFilter/a\
const path = require('\''path'\'');' backend/services/tmMessageProcessor.js

echo "✅ Fixed dataDir issue in tmMessageProcessor.js"
