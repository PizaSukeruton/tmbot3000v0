const express = require('express');
const router = express.Router();
const EventManager = require('../plugins/eventScheduler/eventManager');

const eventManager = new EventManager();

// GET /api/events - Get all events
router.get('/', async (req, res) => {
  try {
    const events = await eventManager.getAllEvents();
    res.json({ events });
  } catch (error) {
    console.error('Error getting events:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/events - Create new event
router.post('/', async (req, res) => {
  try {
    const event = await eventManager.createEvent(req.body);
    res.status(201).json({ event });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: error.message });
  }
});


// GET /api/tour-members - Get tour members
router.get("/tour-members", async (req, res) => {
  try {
    const fs = require("fs").promises;
    const path = require("path");
    const { parse } = require("csv-parse/sync");
    
    const membersFile = path.join(__dirname, "..", "data", "tour_members.csv");
    const fileContent = await fs.readFile(membersFile, "utf-8");
    const members = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });
    
    res.json({ members });
  } catch (error) {
    console.error("Error getting tour members:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
