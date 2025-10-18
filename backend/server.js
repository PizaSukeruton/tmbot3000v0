require('dotenv').config();
const fs = require("fs");
console.log("Node Modules Exists:", fs.existsSync("./node_modules"));
console.log("Fuse Exists:", fs.existsSync("./node_modules/fuse.js"));
console.log("Fuse path check:", require.resolve("fuse.js"));
const { loadAliasIndex } = require("./services/termIndex");
// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db/pool');
const { createCsvDataSource } = require("./services/csvDataSource");
const DATA_DIR = process.env.TM_DATA_DIR || path.join(__dirname, "data");
const dataSource = createCsvDataSource({ dataDir: DATA_DIR });

// Core services
const processor = require('./services/tmMessageProcessor');

// Auth routes
const authRoutes = require('./routes/auth');

// Create app + processor
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'sessions'
  }),
  secret: process.env.SESSION_SECRET || 'tmbot3000-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Auth routes
app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Chat endpoint
app.post('/api/chat/message', async (req, res) => {
  try {
    const { content } = req.body;
    
    // Get memberId from authenticated session
    const memberId = req.session.userId || req.body.memberId; // fallback for testing
    if (!memberId || !content) {
      return res.status(400).json({ error: 'memberId and content are required' });
    }

    const result = await processor.processMessage(
      content,
      {},
      { member_id: memberId }
    );
    res.json(result);
  } catch (err) {
    console.error('[Server] Error handling /api/chat/message:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Schedule endpoint - reads ALL fields dynamically from CSV
app.get('/api/schedule/:day', async (req, res) => {
  const { day } = req.params;
  
  try {
    const { shows } = await dataSource.getShows({});
    
    const now = new Date();
    const todayStr = new Date().toLocaleDateString("en-CA");
    const tomorrowStr = new Date(Date.now() + 24*60*60*1000).toLocaleDateString("en-CA");
    
    console.log("[DEBUG] Server now:", now);
    
    let targetDateStr = (day === 'tomorrow') ? tomorrowStr : todayStr;
    
    // Check both shows and events concurrently
    const [targetShow, dayEvents] = await Promise.all([
      Promise.resolve(shows.find(show => {
        return show.date === targetDateStr;
      })),
      dataSource.getEvents ? dataSource.getEvents(targetDateStr) : Promise.resolve([])
    ]);
    
    const response = {
      day: day === 'tomorrow' ? 'Tomorrow' : 'Today',
      hasShow: !!targetShow,
      show: targetShow || null,
      events: dayEvents
    };
    
    if (!targetShow && dayEvents.length === 0) {
      response.message = "No show or events scheduled";
    } else if (!targetShow) {
      response.message = "No show scheduled, but events exist";
    }
    
    res.json(response);    
  } catch (error) {
    console.error('[API] Schedule error:', error);
    res.status(500).json({ error: 'Failed to load schedule' });
  }
});

// Serve frontend (if built)
app.use(express.static(path.join(__dirname, 'public')));

// root → serve test UI
app.get('/', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  loadAliasIndex().then(r => console.log("[AliasIndex] loaded", r)).catch(e => console.error("[AliasIndex] failed", e));
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Auth] Authentication endpoints available at /api/auth/*`);
});
