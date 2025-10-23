const path = require("path");
const mapsService = require("./tmMapsService");const { Pool } = require("pg");

// Postgres (answers come from tm_answers)
const __pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SSL is enabled for the live environment
  ssl: { rejectUnauthorized: false }
});
const db = { query: (text, params) => __pool.query(text, params) };

// The createCsvDataSource is in the same directory as this file.
const { createCsvDataSource } = require("./csvDataSource");
const DATA_DIR = process.env.TM_DATA_DIR || path.resolve(__dirname, "..", "data");
console.log("[CSV-DIR]", DATA_DIR);
const prodNotesPath = path.join(DATA_DIR, "production_notes.csv");
console.log("[CSV-FILE-EXISTS]", require("fs").existsSync(prodNotesPath));const dataSource = createCsvDataSource({ dataDir: DATA_DIR });

// -------- helpers --------
// This function dynamically gets the term IDs from the database.
async function getTermIds() {
  const sql = `
    SELECT DISTINCT term_id
    FROM tm_answers
    WHERE is_current = true
    ORDER BY term_id;
  `;
  try {
    const res = await db.query(sql);
    // Return an array of lowercase term_ids for case-insensitive matching
    return res.rows.map(row => row.term_id.toLowerCase());
  } catch (error) {
    console.error("Error fetching term IDs:", error.message);
    return [];
  }
}

// NEW: This function dynamically gets all unique city names from the flights CSV data.
// It reads the file directly to avoid reliance on an external API on the dataSource.
async function getCitiesFromCsv() {
  try {
    const fs = require("fs");
    const file = path.resolve(DATA_DIR, "travel_flights.csv");
    const showsFile = path.resolve(DATA_DIR, "shows.csv");    if (!fs.existsSync(file)) return [];
    
    const txt = fs.readFileSync(file, "utf8");
    const lines = txt.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) return [];
    
    const header = lines.shift();
    const cols = header.split(",");
    const idx = (n) => cols.indexOf(n);
    const I = {
      departure_city: idx("departure_city"),
      arrival_city: idx("arrival_city"),
    };
    
    const cities = new Set();
    lines.forEach(line => {
      const parts = line.split(',');
    const depCity = parts[I.departure_city];
    const arrCity = parts[I.arrival_city];
    if (arrCity && !arrCity.match(/^\d{4}-\d{2}-\d{2}T/)) cities.add(arrCity.toLowerCase());    });
    
    
    // Also get cities from shows.csv
    if (fs.existsSync(showsFile)) {
      const showsTxt = fs.readFileSync(showsFile, "utf8");
      const showsLines = showsTxt.split(/\r?\n/).filter(Boolean);
      if (showsLines.length > 1) {
        const showsHeader = showsLines.shift();
        const showsCols = showsHeader.split(",");
        const cityIdx = showsCols.indexOf("city");
        showsLines.forEach(line => {
          const parts = line.split(",");
          const city = parts[cityIdx];
          if (city && !city.match(/^\d{4}-\d{2}-\d{2}T/)) cities.add(city.toLowerCase());
        });
      }
    }    return Array.from(cities);
  } catch (error) {
    console.error("Error fetching city data from CSV:", error.message);
    return [];
  }
}

// This function resolves an answer for a specific term ID.
async function resolveAnswer(term_id, locale = "en-AU") {
  const sql = `
    SELECT answer_template
    FROM tm_answers
    WHERE term_id = $1 AND locale = $2 AND is_current = true
    ORDER BY version DESC
    LIMIT 1`;
  const r = await db.query(sql, [term_id, locale]);
  return (r.rows && r.rows[0] && r.rows[0].answer_template) ? r.rows[0].answer_template : null;
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d;
  }
}

function lineForShow(s, i) {
  return `${fmtDate(s.date)} - ${s.venue_name}, ${s.city}`;
}
// -------- engine --------
class TmAiEngine {
  constructor(pool) {
    this.pool = pool;
    this.industryTerms = [];
    this.cities = [];

    // Longer/more specific verbs first.
    this.VERBS = [
      "tell me about",
      "what time is",
      "when is",
      "where is",
      "who is",
      "what is"
    ];

    // Load the terms and cities when the engine is instantiated.
    this.loadTerms(); 
    this.loadCities();
    if (this.loadTimeTermsFromDb) this.loadTimeTermsFromDb();
  }

  // Method to asynchronously load the terms from the database
  async loadTerms() {
    this.industryTerms = await getTermIds();
    console.log(`Loaded ${this.industryTerms.length} industry terms from the database.`);
    this.buildRouterHints();
  }

  // Method to asynchronously load cities from the CSV data
  async loadCities() {
    this.cities = await getCitiesFromCsv();
    console.log(`Loaded ${this.cities.length} unique cities from the travel data.`);
  }

  // --- Parser helpers ---

  normalizeMessage(message = "") {
    // Lowercase + strip punctuation; keep spaces/word chars.
    return String(message)
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * parseMessage -> { verb: string|null, entities: string[] }
   * Entities come from dynamic sources: this.industryTerms + this.cities
   */
  parseMessage(message = "") {
    const out = { verb: null, entities: [], normalized: "" };
    const normalized = this.normalizeMessage(message);
    if (!normalized) {
      out.normalized = normalized;
      return out;
    }

    // 1) verb
    for (const v of this.VERBS) {
      if (normalized.startsWith(v)) {
        out.verb = v;
        break;
      }
    }

    // 2) entities (scan across both lists)
    const candidates = [
      ...(this.industryTerms || []),
      ...(this.cities || [])
    ].filter(Boolean);

    // Keep order of first appearance; avoid dupes.
    for (const c of candidates) {
      if (normalized.includes(c) && !out.entities.includes(c)) {
        out.entities.push(c);
      }
    }

    // Heuristic: add common domain tokens as router hints (does not hardcode answers)
    const extraHints = ['flight', 'flights', 'show'];
    for (const hint of extraHints) {
      if (normalized.includes(hint) && !out.entities.includes(hint)) {
        out.entities.push(hint);
      }
    }

    out.normalized = normalized;
    return out;
  }

  buildRouterHints() {
    // Use only human-word terms as hints (ignore IDs like #604001).
    const wordy = (this.industryTerms || [])
      .filter(t => /^[a-z]/.test(t))
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    // Dedupe
    const seen = new Set();
    const hints = [];
    for (const w of wordy) {
      if (!seen.has(w)) { seen.add(w); hints.push(w); }
    }

    // Sort by length desc for greedy matching
    hints.sort((a, b) => b.length - a.length);
    this.routerHints = hints;

    console.log(`[TmAiEngine] Router hints ready: ${this.routerHints.length} terms`);
  }

  /** Return the first show matching a city (case-insensitive). */
  async getShowByCity(city) {
    if (!city) return null;
    const { shows = [] } = await dataSource.getShows({});
    const c = String(city).toLowerCase();
    const matches = shows.filter(s => (s.city || "").toLowerCase() === c);
    
    // Prefer shows with show_time populated (actual performances, not travel days)
    const withShowTime = matches.filter(s => s.show_time);
    return withShowTime[0] || matches[0] || null;
  }

  /**
   * Try to find the most relevant field in a show object for a given term, without hard-coding.
   * Strategy:
   *  - Normalize term and keys (letters+digits only).
   *  - Prefer keys that end with "_time" or contain "time".
   *  - If verb is location-like, prefer venue/location fields.
   */
  findFieldForTerm({ show, term, verb }) {
    if (!show || !term) return null;

    const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const nTerm = norm(term);

    const keys = Object.keys(show || {});
    const scored = [];

    for (const k of keys) {
      const nk = norm(k);

      // Basic relevance: does key mention the term?
      const mentions = nk.includes(nTerm);

      // Heuristics for different verb families
      const isTimeKey = /time$|time\b/.test(k) || nk.endsWith('time') || nk.includes('time');
      const isVenueKey = ['venue', 'venue_name', 'address', 'location'].some(v => nk.includes(norm(v)));
      const isCityKey  = nk === 'city' || nk.endsWith('city');
      const isStateKey = nk === 'state' || nk === 'region';
      const isCountryKey = nk === 'country';

      let score = 0;
      if (mentions) score += 5;
      if (isTimeKey) score += 3;

      // If the user asked "where is ...", prefer venue/location-ish keys.
      const locationLike = (verb === 'where is');
      if (locationLike && (isVenueKey || isCityKey || isStateKey || isCountryKey)) {
        score += 4;
      }

      // If time-like verb, bump time-keys.
      const timeLike = (verb === 'what time is' || verb === 'when is');
      if (timeLike && isTimeKey) score += 4;

      // Keep only keys with non-empty values
      const val = show[k];
      if (val != null && String(val).trim() !== '' && score > 0) {
        scored.push({ k, score, val });
      }
    }

    if (!scored.length) {
      const timeLike = (verb === "what time is" || verb === "when is");
      if (timeLike) {
        const prefs = ["soundcheck_time","load_in_time","doors_time","show_time"];
        for (const p of prefs) {
          if (Object.prototype.hasOwnProperty.call(show, p) && String(show[p] || "").trim() !== "") {
            return { k: p, score: 1, val: show[p] };
          }
        }
      }
      return null;
    }
    // Highest score wins
    scored.sort((a, b) => b.score - a.score);
    return scored[0]; // { k, score, val }
  }

  /**
   * retrieveData(parsed) -> structured object for the generator
   * Returns one of:
   *  - { responseType: "contextualTerm",     payload: { term, city, field, value } }
   *  - { responseType: "contextualLocation", payload: { term, city, field, value, place } }
   *  - { responseType: "genericTerm",        payload: { term, definition } }
   *  - { responseType: "travelSchedule",     payload: { text } }
   *  - null
   */
  async retrieveData(parsed) {
    const { verb, entities = [], normalized = "" } = parsed || {};
    if (!entities.length && !normalized) return null;

    // Classify entities using your dynamic lists
    let term = null;
    let city = null;
    for (const e of entities) {
      if (!term && this.industryTerms?.includes(e)) term = e;     // DB hex IDs (rarely appear in user text)
      if (!city && this.cities?.includes(e)) city = e;
    }

    const q = normalized || "";

    try {
      if (/(?:\bwhen\b|\bwhat\s*time\b)/i.test(q)) {
        const directTerms = [
          { rx: /\bcheckout\b/i,         field: 'checkout_time'      },
          { rx: /\bdeparture\b/i,        field: 'departure_time'     },
          { rx: /\bairport\s*call\b/i,  field: 'airport_call_time'  },
          { rx: /\blobby\s*call\b/i,    field: 'lobby_call_time'    }
        ];
        const hit = directTerms.find(t => t.rx.test(q));
        if (hit) {
          const parsed = this.parseCityAndTerm(String(q||"")) || {};
          const city = parsed.city;
          if (!city) { 
            return { responseType: "fallback", payload: { text: 'I can grab the exact time if you tell me the city (e.g., "when are doors in Sydney?").' } }; 
          }
          if (!this.timeTermMap || typeof this.timeTermMap !== 'object') {
            if (typeof this.loadTimeTermsFromDb === 'function') { 
              try { await this.loadTimeTermsFromDb(); } catch(_){} 
            }
            this.timeTermMap = this.timeTermMap || {};
          }
          const show = await this.getNextShowByCity(city);
          if (show) {
            const __picked = (typeof __pickTimeField === 'function') ? __pickTimeField(show, hit.field) : hit.field;
            if (__picked && show[__picked]) {
              let label = null;
              const map = this.timeTermMap || {};
              for (const k in map) {
                const v = map[k] || {};
                const fk = v.field_key || v.field;
                if (fk === hit.field) { label = v.label; break; }
              }
              label = label || (String(hit.field).replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase()));
              const tz = show.timezone ? (' ' + show.timezone) : '';
              return { responseType: "schedule", payload: { text: `${label} for ${city} (${show.venue_name || 'TBA'}) on ${show.date || 'TBA'}: ${show[__picked]}${tz}` } };
            }
          }
          return { responseType: "fallback", payload: { text: `I couldn't find ${hit.field.replace(/_/g,' ')} for ${city} on the next show. If there's a later date or a different city, try that.` } };
        }
      }
    } catch(_) { }

    // Try to infer a human term from DB-derived router hints when missing
    const timeLike = (verb === "what time is" || verb === "when is");
    if (!term && this.routerHints && timeLike && city) {
      for (const h of this.routerHints) {
        if (q.includes(h)) { term = h; break; }
      }
    }

    // --- Only route to travel if the message actually mentions flights ---
    const mentionsFlight = /\bflight(s)?\b/.test(q);
    if (mentionsFlight) {
      const text = formatUpcomingFlights(10, city ? { toCity: city, userTz: "Australia/Sydney" } : { userTz: "Australia/Sydney" });
      return { responseType: "travelSchedule", payload: { text } };
    }

    // --- If time-like + city, try to infer the show field directly from the message ---
    function guessTermFromShowKeys(qstr, showObj) {
      const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
      const qs = norm(qstr);
      for (const k of Object.keys(showObj || {})) {
        const base = k.replace(/_?(time|name)$/i, "");
        const baseNorm = norm(base).replace(/_/g, "");
        if (!baseNorm) continue;
        if (qs.includes(baseNorm)) return base; // e.g., "soundcheck"
      }
      return null;
    }

    // --- Contextual show lookup for any term with a city ---
    if (city) {
      const show = await this.getShowByCity(city);
      if (show) {
        if (!term) {
          const guessed = guessTermFromShowKeys(q, show);
          if (guessed) term = guessed;
        }
        if (term) {
          const hit = this.findFieldForTerm({ show, term, verb });
          if (hit) {
            if (verb === "where is") {
              const locParts = [show.venue_name, show.city, show.state || show.region, show.country].filter(Boolean);
              const place = locParts.join(", ");
              return { responseType: "contextualLocation", payload: { term, city, field: hit.k, value: hit.val, place } };
            }
            return { responseType: "contextualTerm", payload: { term, city, field: hit.k, value: hit.val } };
          }
        }
        if (term && this.industryTerms?.includes(term)) {
          const definition = await resolveAnswer(term);
          if (definition) return { responseType: "genericTerm", payload: { term, definition } };
        }
        return null;
      }
      if (term && this.industryTerms?.includes(term)) {
        const definition = await resolveAnswer(term);
        if (definition) return { responseType: "genericTerm", payload: { term, definition } };
      }
      return null;
    }

    // --- Generic definition (term only, no city) ---
    if (term) {
      const definition = await resolveAnswer(term);
      if (definition) return { responseType: "genericTerm", payload: { term, definition } };
    }

    return null;
  }

  generateResponseText(retrieved) {
    const FALLBACKS = [
      "Sorry, I don't have that info yet. Try another term?",
      "Hmm, I can't find that. Want to ask about show times or venues?",
      "I don't have that, but I can help with schedules, venues, or merch."
    ];
    if (!retrieved) return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];

    const { responseType, payload = {} } = retrieved;

    if (responseType === "travelSchedule") {
      return payload.text || FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
    }

    if (responseType === "contextualLocation") {
      const { term, city, place } = payload;
      return `The ${term} for the show in ${city} is at ${place}.`;
    }

    if (responseType === "contextualTerm") {
      const { term, city, field, value } = payload;
      // Add "at " when the field looks time-like for readability
      const prefix = String(field).toLowerCase().includes('time') ? 'at ' : '';
      return `The ${term} for the show in ${city} is ${prefix}${value}.`;
    }

    if (responseType === "genericTerm") {
      const { term, definition } = payload;
      return `The official definition for ${term} is: ${definition}`;
    }

    return FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
  }

  // -------- Main dispatcher --------
  async generateResponse({ message, intent, context, member, session }) {
    try {
      const _q_norm = String(message || "").toLowerCase();
      const _timey = /(what\s+time|doors?\b|sound\s*-?check|load[\s-]?in|load[\s-]?out|on\s*[-\s]*stage|curfew|set\s*time|show\s*time|band\s*call|crew\s*call|lobby\s*call|airport\s*call|check[-\s]*out\s*time)/.test(_q_norm);
      if (!intent) intent = {};
      if (!intent.intent_type && _timey) intent.intent_type = "term_lookup";
      const memberStr = typeof member === "string" ? member : (member && (member.memberId || member.member_id || member.id || member.identifier)) || "guest";

      if (!intent || !intent.intent_type) {
        return { type: "fallback", text: "I'm not sure how to handle that yet." };
      }

      console.log("[DEBUG] About to enter switch, intent_type =", intent.intent_type);
      console.log("[DEBUG] Intent received:", JSON.stringify(intent));      console.log("[DEBUG] Intent received:", JSON.stringify(intent));      switch (intent.intent_type) {
        case "help":

        case "response_mode_toggle": {
          const newMode = intent.entities?.mode || 'basic';
          
          // Update the session that was passed to us
          if (session) {
            session.responseMode = newMode;
          }
          
          const modeDescription = newMode === "expanded" ? 
            "Expanded mode activated. I will now provide detailed responses with additional context and helpful information." : 
            "Basic mode activated. I will keep my responses brief and to the point.";
          
          return { 
            type: "settings_update", 
            text: modeDescription
          };
        }
        case "personnel_query": {
          const personName = intent.entities?.person_name;
          if (!personName) {
            return { type: "personnel", text: "I need more information. Who are you asking about?" };
          }
          
          // Check if this role exists in multiple shows
          // Check if location is specified
          const location = intent.entities?.location;
          const allMatches = location ? 
            await dataSource.checkPersonnelAcrossShows(`${personName} in ${location}`) :
            await dataSource.checkPersonnelAcrossShows(personName);          
          if (allMatches.length === 0) {
            return { type: "personnel", text: `I couldn't find information about ${personName}. You can ask about roles like FOH tech, guitar tech, drum tech, lighting tech, production manager, etc.` };
          }
          
          // If only one match across all shows, return it directly
          if (allMatches.length === 1) {
            const person = allMatches[0];
            const responseMode = session?.responseMode || 'basic';
            console.log("[DEBUG] Session in personnel_query:", session);
            
            if (responseMode === 'expanded') {
              const show = await dataSource.getShows().then(data => 
                data.shows.find(s => s.show_id === person.show_id)
              );
              
              let expandedText = `The ${person.role} is ${person.name} - contact: ${person.contact}.`;
              
              if (show) {
                expandedText += `\n\nThey'll be working the ${show.city} show at ${show.venue_name} on ${new Date(show.date).toLocaleDateString()}.`;
                if (show.load_in_time) {
                  expandedText += ` Load-in is at ${show.load_in_time}.`;
                }
              }
              
              if (person.note && person.note.includes('high')) {
                expandedText += `\n\nNote: This is marked as high priority.`;
              }
              
              return { type: "personnel", text: expandedText };
            } else {
              return { type: "personnel", text: `The ${person.role} is ${person.name} - contact: ${person.contact}.` };
            }
          }
          
          // Multiple matches - check if we have context
          const context = intent.context || intent.assumedContext;
          if (context && context.show_id) {
            // Find the match for the specific show
            const showMatch = allMatches.find(p => p.show_id === context.show_id);
            if (showMatch) {
              const clarification = intent.needsConfirmation ? `You didn't specify a city or show, so I'm assuming you mean the next show in ${context.city} on ${context.dateString}. ` : "";
              return { type: "personnel", text: `${clarification}The ${showMatch.role} for this show is ${showMatch.name} - contact: ${showMatch.contact}.` };
            }
          }
          
          // Multiple matches but no context - this should trigger Next Step Logic
          return { type: "personnel", text: `I found ${allMatches.length} different ${personName}s across the tour. Which show are you asking about?` };
        }
        break;
        
        case "venue_query": {
          console.log("[DEBUG] >>> VENUE_QUERY CASE ENTERED <<<");
          const queryType = intent.entities?.query_type || "contact";
          const queryLocation = intent.entities?.location;
          let context = null;
          
          if (queryLocation) {
            const allShows = await dataSource.getShows();
            const locationLower = queryLocation.toLowerCase();
            const matchingShow = allShows.shows.find(show => 
              show.city.toLowerCase().includes(locationLower)
            );
            
            if (matchingShow) {
              context = {
                show_id: matchingShow.show_id,
                venue_id: matchingShow.venue_id,
                venue_name: matchingShow.venue_name,
                city: matchingShow.city,
                date: matchingShow.date
              };
            }
          } else {
            context = intent.context || intent.assumedContext;
          }
          
          if (!context || !context.venue_id) {
            return { type: "fallback", text: "Please specify which venue you're asking about." };
          }
          
          const venue = await dataSource.getVenue(context.venue_id);
          
          if (!venue) {
            return { type: "fallback", text: "I couldn't find information for that venue." };
          }
          
          let response = "";
          switch (queryType) {
            case "contact":
            case "manager":
              response = `The venue contact for ${venue.name} in ${context.city} is ${venue.contact.name} - ${venue.contact.phone} (${venue.contact.email}).`;
              break;
            case "phone":
              response = `The venue phone for ${venue.name} is ${venue.contact.phone}.`;
              break;
            case "email":
              response = `The venue email for ${venue.name} is ${venue.contact.email}.`;
              break;
            default:
              response = `The venue contact for ${venue.name} is ${venue.contact.name} - ${venue.contact.phone}.`;
          }
          
          return { type: "venue_info", text: response };
        }
        
          break;
        case "travel_time_query": {
          console.log("[DEBUG] Entering travel_time_query case");
          // Prioritize session context over assumed context
          let context = null;
          // Check if a location was specified in the query
          if (intent.entities && intent.entities.location) {
            const locationName = intent.entities.location;
            // Try to find a show for this location
            const showsData = await dataSource.getShows();
            const shows = showsData.shows;
            const locationShow = shows.find(s => 
              s.city && s.city.toLowerCase().includes(locationName.toLowerCase())
            );
            if (locationShow) {
              context = {
                show_id: locationShow.show_id,
                venue_id: locationShow.venue_id,
                venue_name: locationShow.venue_name,
                city: locationShow.city,
                date: locationShow.date,
                dateString: new Date(locationShow.date).toLocaleDateString("en-AU", {
                  weekday: "short",
                  day: "numeric",
                  month: "short"
                })
              };
              console.log("[AI] Found location-specific context:", context);
            }
          }
          if (!context && session && session.context && session.context.show_id) {
            context = session.context;
            console.log("[AI] Using session context for travel query");
          } else if (!context) {
            context = intent.context || intent.assumedContext;
            console.log("[AI] Using intent context for travel query");
          }          
          if (!context || !context.venue_id) {
            return { 
              type: "travel_info", 
              text: "I need to know which show you're asking about to calculate travel time."
            };
          }
          
          try {
            // Get venue and hotel info
            const venue = await dataSource.getVenue(context.venue_id);
            console.log("[AI] Venue object:", JSON.stringify(venue, null, 2));            if (!venue) {
              return { type: "travel_info", text: "I couldn't find venue information." };
            }
            
            const hotel = await dataSource.getHotel(context.show_id);
            if (!hotel) {
              return { type: "travel_info", text: "I couldn't find hotel information for this show." };
            }
            
            const hotelAddress = hotel.address;            // Check what destination was requested
            // Determine origin address based on user request
            let originAddress, originName;
            if (intent.entities && intent.entities.origin === "venue") {
              originAddress = `${venue.address.street}, ${venue.address.city}, ${venue.address.state} ${venue.address.zip}`;
              originName = venue.name;
            } else {
              originAddress = hotel.address;
              originName = hotel.name;
            }
            let destinationAddress, destinationName;
            if (intent.entities && intent.entities.destination === "airport") {
            console.log("[AI] Destination request - location entity:", intent.entities?.destination);              // For now, we will use the city airport - in a real system, this would come from data
              // Get airport information from CSV data
              const airport = await dataSource.getAirportByCity(context.city);
              if (!airport) {
                return { type: "travel_info", text: `I don't have airport information for ${context.city}.` };
              }
              destinationAddress = airport.address;
              destinationName = airport.name;              // Default to venue
            console.log("[AI] Calling maps API with:");
            } else {
              // Default to venue
              destinationAddress = `${venue.address.street}, ${venue.address.city}, ${venue.address.state} ${venue.address.zip}`;
              destinationName = venue.name;
            }            console.log("  From:", originAddress);
            console.log("  To:", destinationAddress);
            const result = await mapsService.getTravelTime(originAddress, destinationAddress);            if (result.error) {
              return { type: "travel_info", text: `Unable to calculate travel time: ${result.error}` };
            }
            
            const duration = result.durationInTraffic || result.duration;
            const minutes = Math.round(duration.value / 60);
            
            const clarification = (intent.needsConfirmation && intent.entities.destination !== "airport") ? `You didn't specify which show, so I'm assuming you mean the next show in ${context.city} on ${context.dateString}. ` : "";
            return {
              type: "travel_info",
              text: `${clarification}Current travel time from ${originName} to ${destinationName} is ${minutes} minutes.`
            };
          } catch (err) {
            console.error("[AI] Travel query error:", err);
            return { type: "travel_info", text: "Sorry, I couldn't calculate the travel time." };
          }
        }

        case "location_specific_query": {
          const location = intent.entities?.location;
          const dateString = intent.entities?.date_string;
          
          const allShows = await dataSource.getShows();
          const locationLower = location.toLowerCase();
          const matchingShows = allShows.shows.filter(show => 
            show.city.toLowerCase().includes(locationLower) ||
            show.venue_name.toLowerCase().includes(locationLower)
          );
          
          if (matchingShows.length === 0) {
            return { type: "fallback", text: `I couldn't find any shows in ${location}.` };
          }
          
          const targetShow = matchingShows[0];
          
          // Check if this is a response to a pending query
          const memberSession = session;
          if (memberSession?.pendingQuery?.originalIntent?.intent_type === "venue_query") {
            // Get venue info for the specified show
            const venue = await dataSource.getVenue(targetShow.venue_id);
            console.log("[AI] Venue object:", JSON.stringify(venue, null, 2));            if (!venue) {
              return { type: "fallback", text: `I couldn't find venue information for ${targetShow.venue_name}.` };
            }
            
            // Clear the pending query
            memberSession.pendingQuery = null;
            
            // Return the venue contact info for Adelaide
            return { 
              type: "venue_info", 
              text: `The venue contact for ${targetShow.venue_name} is ${venue.contact.name} - ${venue.contact.phone} (${venue.contact.email}).` 
            };
          }
          
          return { 
            type: "location_confirmation", 
            text: `I found a show in ${targetShow.city} at ${targetShow.venue_name} on ${new Date(targetShow.date).toLocaleDateString()}. What would you like to know about this show?`
          };
        }
        case "location_query": {
          const locationName = intent.entities?.location_name;
          if (!locationName) {
            return { type: "location", text: "I need more information. What location are you asking about?" };
          }
          
          // Check if this facility exists across multiple venues
          const facilityType = locationName.split(" ")[0]; // e.g. "first"
          const cityPart = locationName.split(" ").slice(1).join(" "); // e.g. "aid sydney"
          
          // If location includes a city, handle it directly
          const location = intent.entities?.location ?
            await dataSource.getLocationInfoByCity(facilityType, intent.entities.location) :
            await dataSource.getLocationInfo(locationName);          if (!location) {
            return { type: "location", text: `I couldn't find location information for ${locationName}. Try asking about specific venues or facilities like stage door, loading dock, first aid, etc.` };
          }
          
          if (location.type === 'venue') {
            let response = `${location.name} is located at:\n${location.address}`;
            if (location.city && location.state) {
              response += `\n${location.city}, ${location.state}`;
            }
            if (location.country) {
              response += ` ${location.country}`;
            }
            if (location.phone) {
              response += `\nPhone: ${location.phone}`;
            }
            return { type: "location", text: response };
          } else if (location.type === 'facility') {
            return { type: "location", text: `${location.name} is located: ${location.location}` };
          }
          
          return { type: "location", text: `Found location: ${JSON.stringify(location)}` };
        }

        case "show_schedule": {
          const { shows = [] } = await dataSource.getShows({});
          const today = new Date();
          const upcoming = shows
            .filter(s => s && s.date && new Date(s.date) >= today)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

          if (!upcoming.length) {
            return { type: "schedule", text: `No upcoming shows found (for: ${memberStr})` };
          }

          const wantNext = /\bnext\s+show\b/i.test(message || "");
          const list = wantNext ? upcoming.slice(0, 1) : upcoming.slice(0, 10);

          const lines = list.map((s, idx) => lineForShow(s, idx + 1));
          const header = `I found ${list.length} ${list.length === 1 ? "show" : "shows"}:\n\n`;
          return { type: "schedule", text: header + lines.join("\n\n") };
        }

        // Term Lookup now routed through parse -> retrieve -> generate pipeline
        case "term_lookup": {
          const q = String(message || "").toLowerCase();
          const termId = (intent && (intent.term_id || (intent.entities && intent.entities.term_id))) || null;
          
          // PRIORITY FIX: Detect "what is X?" questions and route to glossary
          const isDefinitionQuery = /^what\s+(is|are)\s+/i.test(q);
          if (isDefinitionQuery && termId) {
            try {
              const sql = `SELECT definition FROM industry_terms WHERE term_id = $1`;
              const result = await db.query(sql, [termId]);
              if (result.rows[0] && result.rows[0].definition) {
                return { type: "answer", text: `The official definition for ${termId} is: ${result.rows[0].definition}` };
              }
            } catch(e) { console.error("[Glossary lookup error]:", e); }
          }
          
          // [TmBot3000::TimeTerms] PRIORITY: schedule time lookup (race-safe) → return immediately on success
          try {
            // Ensure DB map is ready
            if (!this.timeTermMap || (typeof this.timeTermMap !== 'object')) {
              if (typeof this.loadTimeTermsFromDb === 'function') {
                await this.loadTimeTermsFromDb();
              }
              if (!this.timeTermMap || (typeof this.timeTermMap !== 'object')) this.timeTermMap = {};
            }

            // Resolve time-term from authoritative map
            const ttHit = termId ? this.timeTermMap[String(termId).toLowerCase()] : null;

            if (ttHit) {
              const __fieldKey = (ttHit.field_key || ttHit.field);
              const parsed = this.parseCityAndTerm(q);
              const city = parsed && parsed.city;

              if (!city) {
                return { type: 'fallback', text: 'I can grab the exact time if you tell me the city (e.g., "when are doors in Sydney?").' };
              }

              const show = await this.getNextShowByCity(city);

              const __picked = __pickTimeField(show, __fieldKey);
              if (__picked) {
                const lbl = ttHit.label || (String(__fieldKey).replace(/_/g,' ').replace(/\b\w/g, m => m.toUpperCase()));
                const tz  = show.timezone ? ` ${show.timezone}` : '';
                const responseMode = session?.responseMode || 'basic';
                
                if (responseMode === 'expanded' && show) {
                  // Build base response
                  let expandedText = `${lbl} for ${city} (${show.venue_name || 'TBA'}) on ${show.date || 'TBA'}: ${show[__picked]}${tz}`;
                  
                  // Get related timeline events
                  const relatedTimes = [];
                  const timeFields = [
                    { field: 'load_in_time', label: 'Load-in' },
                    { field: 'lobby_call_time', label: 'Lobby call' },
                    { field: 'doors_time', label: 'Doors' },
                    { field: 'show_time', label: 'Show time' }
                  ];
                  
                  for (const tf of timeFields) {
                    if (tf.field !== __fieldKey && show[tf.field]) {
                      relatedTimes.push(`${tf.label}: ${show[tf.field]}`);
                    }
                  }
                  
                  if (relatedTimes.length > 0) {
                    expandedText += '\n\nRelated times:';
                    relatedTimes.forEach(rt => {
                      expandedText += '\n' + rt;
                    });
                  }
                  
                  // Add travel time from hotel
                  try {
                    const hotel = await dataSource.getHotel(show.show_id);
                    if (hotel) {
                      const venue = await dataSource.getVenue(show.venue_id);
                      if (venue) {
                        const hotelAddress = hotel.address;
                        const venueAddress = `${venue.address.street}, ${venue.address.city}, ${venue.address.state}`;
                        const result = await mapsService.getTravelTime(hotelAddress, venueAddress);
                        if (result && !result.error) {
                          const minutes = Math.round((result.durationInTraffic || result.duration).value / 60);
                          expandedText += `\n\nIn normal traffic conditions, the drive to the venue is ${minutes} minutes.`;
                        }
                      }
                    }
                  } catch (e) {
                    console.error("[AI] Could not calculate travel time:", e);
                  }
                  
                  return {
                    type: 'schedule',
                    text: expandedText
                  };
                } else {
                  return {
                    type: 'schedule',
                    text: `${lbl} for ${city} (${show.venue_name || 'TBA'}) on ${show.date || 'TBA'}: ${show[__picked]}${tz}`
                  };
                }
              } else {
                const lbl = ttHit.label || 'that time';
                return { type: 'fallback', text: `I couldn't find ${lbl} for ${city} on the next show. If there's a later date or a different city, try that.` };
              }
            }
            
            // NL direct map for common time terms when no term_id was produced
            try {
              if (!ttHit) {
                const directTerms = [
                  { rx: /\bdeparture\b/i,        field: 'departure_time',     label: 'Departure time' },
                  { rx: /\bcheckout\b/i,         field: 'checkout_time',      label: 'Checkout time'  },
                  { rx: /\bairport\s*call\b/i,  field: 'airport_call_time',  label: 'Airport call time' },
                  { rx: /\blobby\s*call\b/i,    field: 'lobby_call_time',    label: 'Lobby call time' }
                ];
                const hit = directTerms.find(t => t.rx.test(q));
                if (hit) {
                  const parsed = this.parseCityAndTerm(q) || {};
                  const city = parsed.city;
                  if (!city) {
                    return { type: 'fallback', text: 'I can grab the exact time if you tell me the city (e.g., "when are doors in Sydney?").' };
                  }
                  const show = await this.getNextShowByCity(city);
                  if (show) {
                    const __picked = __pickTimeField(show, hit.field);
                    if (__picked) {
                      const tz = show.timezone ? (' ' + show.timezone) : '';
                      return {
                        type: 'schedule',
                        text: `${hit.label} for ${city} (${show.venue_name || 'TBA'}) on ${show.date || 'TBA'}: ${show[__picked]}${tz}`
                      };
                    }
                  }
                  return { type: 'fallback', text: `I couldn't find ${hit.label} for ${city} on the next show. If there's a later date or a different city, try that.` };
                }
              }
            } catch(_) { /* fall through */ }
          } catch (e) {
            // On error, fall through to glossary path
            console.warn('[TimeTerms] priority block error:', e && e.message);
          }

          const locale = process.env.LOCALE || "en-AU";

          // 1) Parse message into { verb, entities }
          const parsed = this.parseMessage(message);

          // 2) Retrieve data based on parsed structure
          let retrieved = await this.retrieveData(parsed);

          // 3) If nothing came back, try legacy quick-match term_id as a safety net
          if (!retrieved) {
            let termId = intent.term_id || (intent.entities && intent.entities.term_id);
            if (!termId && message) {
              const normalizedMessage = (message || "").toLowerCase();
              const foundTerm = this.industryTerms.find(term => normalizedMessage.includes(term));
              if (foundTerm) termId = foundTerm;
            }
            if (termId) {
              const definition = await resolveAnswer(termId, locale);
              if (definition) {
                retrieved = { responseType: "genericTerm", payload: { term: termId, definition } };
              }
            }
          }

          // 4) Generate user-facing text from retrieved data (or friendly fallback)
          const text = this.generateResponseText(retrieved);
          return { type: "answer", text };
        }

        // Refactored Flights / travel handler
        case "travel": {
          // [TmBot3000] time-term override inside travel: checkout/departure/airport call/lobby call
          {
            const qText = String(message || "");
            const timey = /(?:\bwhen\b|\bwhat\s*time\b)/i.test(qText);
            const directTerms = [
              { rx: /\bcheckout\b/i,         field: 'checkout_time',      label: 'Checkout time' },
              { rx: /\bdeparture\b/i,        field: 'departure_time',     label: 'Departure time' },
              { rx: /\bairport\s*call\b/i,  field: 'airport_call_time',  label: 'Airport call time' },
              { rx: /\blobby\s*call\b/i,    field: 'lobby_call_time',    label: 'Lobby call time' }
            ];
            const hit = timey ? directTerms.find(t => t.rx.test(qText)) : null;
            if (hit) {
              const parsed = this.parseCityAndTerm(qText) || {};
              const city = parsed.city;
              if (!city) {
                return { type: 'fallback', text: 'I can grab the exact time if you tell me the city (e.g., "when are doors in Sydney?").' };
              }
              const show = await this.getNextShowByCity(city);
              if (show) {
                const picked = (typeof __pickTimeField === 'function') ? __pickTimeField(show, hit.field) : hit.field;
                if (picked && show[picked]) {
                  const tz = show.timezone ? (' ' + show.timezone) : '';
                  return { type: 'schedule', text: `${hit.label} for ${city} (${show.venue_name || 'TBA'}) on ${show.date || 'TBA'}: ${show[picked]}${tz}` };
                }
              }
              return { type: 'fallback', text: `I couldn't find ${hit.label} for ${city} on the next show. If there's a later date or a different city, try that.` };
            }
          }

          try {
            const opts = { userTz: "Australia/Sydney" };
            let limit = 10;
            const normalizedMessage = (message || "").toLowerCase();

            // Check for "from" city first using the dynamically loaded city list
            const fromCityMatch = this.cities.find(city => normalizedMessage.includes(`from ${city}`));
            if (fromCityMatch) {
              opts.fromCity = fromCityMatch;
              limit = 50;
            } else {
              // Check for "to" city
              const toCityMatch = this.cities.find(city => normalizedMessage.includes(`to ${city}`));
              if (toCityMatch) {
                opts.toCity = toCityMatch;
                limit = 50;
              } else if (/\bnext\b/.test(normalizedMessage)) {
                // Check for "next"
                opts.nextOnly = true;
                limit = 1;
              } else if (/\btoday\b/.test(normalizedMessage)) {
                // Check for "today"
                opts.todayOnly = true;
                limit = 50;
              } else {
                // Final fallback: check for any city name without a prefix
                const genericCityMatch = this.cities.find(city => normalizedMessage.includes(city));
                if (genericCityMatch) {
                  opts.city = genericCityMatch;
                  limit = 50;
                }
              }
            }
            const text = formatUpcomingFlights(limit, opts);
            return { type: "schedule", text };
          } catch (e) {
            console.error("[TmAiEngine] Error in travel handler:", e);
            return { type: "error", text: "Flights lookup failed: " + e.message };
          }
        }
        

        case "flight_query": {
  const { flight_number, date, confirmation, query_type, destination } = intent.entities || {};

  // If the user specified a destination, filter for flights to that city
  if (destination) {
    const allFlights = await dataSource.getFlights();
    const flightsToDest = allFlights.filter(f => 
      f.arrival_city && f.arrival_city.toLowerCase() === destination.toLowerCase()
    );
    
    const now = new Date();
    const nextFlightToDest = flightsToDest
      .filter(f => new Date(f.departure_time) > now)
      .sort((a, b) => new Date(a.departure_time) - new Date(b.departure_time))[0];
    
    if (nextFlightToDest) {
      const depTime = new Date(nextFlightToDest.departure_time);
      const arrTime = new Date(nextFlightToDest.arrival_time);
      
      let response = `Your next flight to ${destination} is ${nextFlightToDest.airline} ${nextFlightToDest.flight_number} from ${nextFlightToDest.departure_city} to ${nextFlightToDest.arrival_city}.\n`;
      response += `Departure: ${depTime.toLocaleString()} ${nextFlightToDest.departure_timezone}\n`;
      response += `Arrival: ${arrTime.toLocaleString()} ${nextFlightToDest.arrival_timezone}\n`;
      response += `Confirmation: ${nextFlightToDest.confirmation}`;
      
      return { type: "flight_info", text: response };
    } else {
      return { type: "flight_info", text: `No upcoming flights to ${destination} found.` };
    }
  }          
          try {
            // Check if looking for next flight
            if (!flight_number && !confirmation) {
              const nextFlight = await dataSource.getNextFlight();
              if (nextFlight) {
                const depTime = new Date(nextFlight.departure_time);
                const arrTime = new Date(nextFlight.arrival_time);
                
                let response = `Your next flight is ${nextFlight.airline} ${nextFlight.flight_number} from ${nextFlight.departure_city} to ${nextFlight.arrival_city}.\n`;
                response += `Departure: ${depTime.toLocaleString()} ${nextFlight.departure_timezone}\n`;
                response += `Arrival: ${arrTime.toLocaleString()} ${nextFlight.arrival_timezone}\n`;
                response += `Confirmation: ${nextFlight.confirmation}`;
                
                // Check flight status if requested
                if (query_type === 'status') {
                  const flightService = require('./tmFlightService');
                  const status = await flightService.getFlightStatus(nextFlight.flight_number, nextFlight.date);
                  if (!status.error) {
                    response += `\n\nStatus: ${status.status}`;
                    if (status.departure.gate) response += `\nDeparture Gate: ${status.departure.gate}`;
                    if (status.arrival.gate) response += `\nArrival Gate: ${status.arrival.gate}`;
                  }
                }
                
                return { type: "flight_info", text: response };
              }
              return { type: "flight_info", text: "No upcoming flights found." };
            }
            
            // Look up by confirmation code
            if (confirmation) {
              const flight = await dataSource.getFlightByConfirmation(confirmation);
              if (flight) {
                const depTime = new Date(flight.departure_time);
                const arrTime = new Date(flight.arrival_time);
                
                let response = `Flight ${flight.airline} ${flight.flight_number}:\n`;
                response += `${flight.departure_city} → ${flight.arrival_city}\n`;
                response += `Departure: ${depTime.toLocaleString()} ${flight.departure_timezone}\n`;
                response += `Arrival: ${arrTime.toLocaleString()} ${flight.arrival_timezone}`;
                
                return { type: "flight_info", text: response };
              }
              return { type: "flight_info", text: `No flight found with confirmation ${confirmation}.` };
            }
            
            // Look up by flight number
            if (flight_number) {
              const flights = await dataSource.getFlights();
              const flight = flights.find(f => f.flight_number === flight_number);
              
              if (flight) {
                const depTime = new Date(flight.departure_time);
                console.log('[DEBUG] Flight date:', flight.date);
                const arrTime = new Date(flight.arrival_time);
                
                let response = `${flight.airline} ${flight.flight_number}:\n`;
                response += `${flight.departure_city} → ${flight.arrival_city}\n`;
                response += `Departure: ${depTime.toLocaleString()} ${flight.departure_timezone}\n`;
                response += `Arrival: ${arrTime.toLocaleString()} ${flight.arrival_timezone}\n`;
                response += `Confirmation: ${flight.confirmation}`;
                
                // Check real-time status if requested
                if (query_type === 'status') {
                  console.log('[DEBUG] Attempting Aviation Stack API call for flight:', flight_number, 'on date:', flight.date);
                  const flightService = require('./tmFlightService');
                  const status = await flightService.getFlightStatus(flight_number, flight.date);
                  console.log('[DEBUG] Aviation Stack response:', status);
                  
                  if (!status.error) {
                    response += `\n\nStatus: ${status.status}`;
                    if (status.departure.gate) response += `\nDeparture Gate: ${status.departure.gate}`;
                    if (status.departure.actual) response += `\nActual Departure: ${status.departure.actual}`;
                    if (status.arrival.gate) response += `\nArrival Gate: ${status.arrival.gate}`;
                    if (status.arrival.actual) response += `\nActual Arrival: ${status.arrival.actual}`;
                  } else {
                    console.log('[DEBUG] Aviation Stack error:', status.error);
                  }
                }
                return { type: "flight_info", text: response };
              }
              return { type: "flight_info", text: `No flight found with number ${flight_number}.` };
            }
            
            return { type: "flight_info", text: "Please specify a flight number or confirmation code." };
            
          } catch (e) {
            console.error("[AI] Flight query error:", e);
            return { type: "error", text: "Unable to retrieve flight information." };
          }
        }
        case "create_event": {
          const EventConversation = require("../plugins/eventScheduler/eventConversation");
          const NaturalLanguageEventCreator = require("../plugins/eventScheduler/naturalLanguageEventCreator");
          
          const sessionId = member.member_id || "default";
          
          // Check if we have entities from natural language processing
          if (intent.entities && Object.keys(intent.entities).length > 0) {
            // Use NaturalLanguageEventCreator for pre-filling
            const nlCreator = new NaturalLanguageEventCreator();
            const result = await nlCreator.processNaturalLanguageRequest(intent.entities, sessionId, member.member_id);
            
            return {
              type: "event_creation",
              text: result.message
            };
          } else {
            // Fall back to step-by-step EventConversation
            const eventConversation = require("../plugins/eventScheduler/eventConversation");
            const result = await eventConversation.handleMessage(sessionId, message, member.member_id);
            
            return {
              type: "event_creation",
              text: result.message
            };
          }
        }
        case "event_confirmation": {
          const EventConversation = require("../plugins/eventScheduler/eventConversation");
          const eventConversation = require("../plugins/eventScheduler/eventConversation");
          
          const sessionId = member.member_id || "default";
          const result = await eventConversation.handleMessage(sessionId, message, member.member_id);
          
          return {
            type: "event_creation",
            text: result.message
          };
        }
        case "event_confirmation": {
          const EventConversation = require("../plugins/eventScheduler/eventConversation");
          const eventConversation = require("../plugins/eventScheduler/eventConversation");
          
          const sessionId = member.member_id || "default";
          const result = await eventConversation.handleMessage(sessionId, message, member.member_id);
          
          return {
            type: "event_creation",
            text: result.message
          };
        }
        default:
          return { type: "unknown", text: `I don't have a handler for intent: ${intent.intent_type}` };
      }
    } catch (err) {
      console.error("[AiEngine] Error in generateResponse:", err);
      return { type: "error", text: "Sorry, something went wrong while generating a response.", error: String(err?.message || err) };
    }
  }
}

module.exports = new TmAiEngine();
