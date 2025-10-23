const express = require('express');
const router = express.Router();

// GET /api/tour-members - Get all tour members
router.get('/', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const { parse } = require('csv-parse/sync');
    
    const membersFile = path.join(__dirname, '..', 'data', 'tour_members.csv');
    const fileContent = await fs.readFile(membersFile, 'utf-8');
    const members = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });
    
    res.json({ members });
  } catch (error) {
    console.error('Error getting tour members:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
