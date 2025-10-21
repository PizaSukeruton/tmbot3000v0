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
    const fs = require("fs");
    const path = require("path");
    const { parse } = require("csv-parse/sync");
    
    const membersFile = path.join(__dirname, "..", "data", "tour_members.csv");
    const fileContent = fs.readFileSync(membersFile, "utf-8");
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


// GET /api/events/:id - Get single event
router.get("/:id", async (req, res) => {
  try {
    const events = await eventManager.getAllEvents();
    const event = events.find(e => e.event_id === req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    
    res.json({ event });
  } catch (error) {
    console.error("Error getting event:", error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/events/:id - Update event
router.put("/:id", async (req, res) => {
  try {
    const event = await eventManager.updateEvent(req.params.id, req.body);
    res.json({ event });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/events/:id - Delete event
router.delete("/:id", async (req, res) => {
  try {
    await eventManager.deleteEvent(req.params.id);
    res.json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
