require('dotenv').config({ path: __dirname + '/.env' });

// TEST: Check if environment variables are loaded immediately after dotenv
console.log('[ENV-TEST] GOOGLE_MAPS_API_KEY exists:', !!process.env.GOOGLE_MAPS_API_KEY);
console.log('[ENV-TEST] GOOGLE_MAPS_API_KEY length:', process.env.GOOGLE_MAPS_API_KEY ? process.env.GOOGLE_MAPS_API_KEY.length : 'undefined');

const fs = require("fs");
console.log("Node Modules Exists:", fs.existsSync("./node_modules"));
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

app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 'https://tmbot3000v0.onrender.com' : 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));app.use(express.json());
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
  name: 'tmbot.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    domain: undefined
  }
}));

// Auth routes
app.use('/api/auth', authRoutes);
app.use("/api/events", require("./routes/events"));
app.use('/api/tour-members', require('./routes/tourMembers'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Chat endpoint
app.post('/api/chat/message', async (req, res) => {
  try {
    const { content } = req.body;
    
    // Get memberId from authenticated session (stored during login)
    const memberId = req.session.memberId;
    
    if (!memberId) {
      return res.status(401).json({ error: "No active session" });
    }    if (!memberId || !content) {
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
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));
// root → serve test UI
app.get('/', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  loadAliasIndex().then(r => console.log("[AliasIndex] loaded", r)).catch(e => console.error("[AliasIndex] failed", e));
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Auth] Authentication endpoints available at /api/auth/*`);
});
