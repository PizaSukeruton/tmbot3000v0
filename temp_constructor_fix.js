  constructor() {
    this.intents = intents;
    this.nextStepFilter = nextStepFilter;
    this.aiEngine = aiEngine;
    
    // Session management - CRITICAL FIX: Ensure persistent sessions Map
    this.sessions = new Map();
    this.cities = []; // Cache for cities from CSV data
    console.log('[MESSAGE-PROCESSOR] Initialized with persistent sessions map');
    
    // Load cities from CSV data on startup
    this.loadCities();
  }

  // Load cities from CSV data and cache them
  async loadCities() {
    try {
      const { createCsvDataSource } = require('./csvDataSource');
      const path = require('path');
      const DATA_DIR = process.env.TM_DATA_DIR || path.join(__dirname, "..", "data");
      const dataSource = createCsvDataSource({ dataDir: DATA_DIR });
      
      const { shows } = await dataSource.getShows();
      const flights = await dataSource.getFlights();
      
      const showCities = shows.map(s => s.city?.toLowerCase()).filter(Boolean);
      const flightCities = flights.flatMap(f => [f.departure_city?.toLowerCase(), f.arrival_city?.toLowerCase()]).filter(Boolean);
      
      this.cities = [...new Set([...showCities, ...flightCities])];
      console.log(`[MESSAGE-PROCESSOR] Loaded ${this.cities.length} cities from CSV data`);
    } catch (error) {
      console.error('[MESSAGE-PROCESSOR] Error loading cities:', error);
      this.cities = [];
    }
  }
