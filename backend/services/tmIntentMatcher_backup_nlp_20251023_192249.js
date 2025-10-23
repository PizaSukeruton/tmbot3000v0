const Fuse = require("fuse.js");
const { normalize } = require("./normalizer");
const { lookupExact, lookupInSentence } = require("./termIndex");
const { cleanName } = require('../utils/textUtils');

class TmIntentMatcher {
  static ROLE_ALIASES = {
    "sound": "FOH Tech",
    "lights": "Lighting Tech",
    "lighting": "Lighting Tech",
    "monitors": "Monitor Tech",
    "guitar": "Guitar Tech",
    "drums": "Drum Tech",
    "keyboards": "Keyboard Tech",
    "keys": "Keyboard Tech",    "sound engineer": "FOH Tech",
    "front of house engineer": "FOH Tech",
    "audio engineer": "FOH Tech",
    "foh engineer": "FOH Tech",
    "stage manager": "Stage Tech",
    "monitor engineer": "Monitor Tech",
    "monitor mix": "Monitor Tech",
    "guitar technician": "Guitar Tech",
    "drum technician": "Drum Tech",
    "keyboard technician": "Keyboard Tech",
    "lighting designer": "Lighting Tech",
    "lighting engineer": "Lighting Tech",
    "crew chief": "Production Manager",
    "prod manager": "Production Manager"
  };

  static canonicalizeEntity(input, type) {
    if (!input) return input;
    input = input.trim().toLowerCase();

    if (type === "role") {
      if (TmIntentMatcher.ROLE_ALIASES[input]) return TmIntentMatcher.ROLE_ALIASES[input];
      const dataSource = require("./csvDataSource");
      const csvData = dataSource.createCsvDataSource({ dataDir: "./data" });
      const roles = csvData.getRoles();
      const Fuse = require("fuse.js");
      const fuse = new Fuse(roles, { threshold: 0.33 });
      const match = fuse.search(input)[0];
      return match ? match.item : input;
    }

    return input;
  }
  async matchIntent(content, options = {}, member = {}) {
    const raw = String(content || "");
    const q = cleanName(raw).toLowerCase();

    let intent = { intent_type: null, confidence: 0, entities: {} };


    // --- PRIORITIZED VENUE QUERY BLOCK ---
    const venueQueryMatch = q.match(/(?:who(?:'s| is)?|what(?:'s| is)?|\bwhich)\s*(?:is|the)?\s*venue\s*(contact|manager|phone|email)\s*(?:for|in|at)?\s*(\w+)?/i) ||
                           q.match(/(?:who(?:'s| is)?|what(?:'s| is)?|\bwhich)\s*(contact|manager|phone|email).*venue\s*(?:for|in|at)?\s*(\w+)?/i) ||
                           q.match(/venue\s*(contact|manager|phone|email)\s*(?:for|in|at)?\s*(\w+)?/i);
    
    if (venueQueryMatch) {
      return {
        intent_type: "venue_query",
        confidence: 0.99,
        entities: {
          query_type: venueQueryMatch[1] ? venueQueryMatch[1].toLowerCase() : null,
          location: venueQueryMatch[2] || null
        }
      };
    }

    // --- PRIORITIZED CREATE TRIGGER BLOCK ---
    const createMatch = q.match(/^create\s+(\w+)/i);
    if (createMatch) {
      const createType = createMatch[1].toLowerCase();
      if (createType === "event" || createType === "meeting" || createType === "appointment") {
        return {
          intent_type: "create_event",
          confidence: 0.99,
          entities: this.extractEventEntities(q)
        };
      }
    }    // Defensive venue query pattern with flexible phrasing - HIGHEST PRIORITY

    // Check for "who is" queries
    const whoIsMatch = q.match(/who\s+is\s+(?:the\s+)?(.+?)\??$/i);
    
    // Check for "who is doing" queries
    const whoIsDoingMatch = q.match(/who\s+is\s+doing\s+(?:the\s+)?(.+?)\??$/i);
    if (whoIsDoingMatch) {
      return {
        intent_type: "personnel_query",
        confidence: 0.95,
        entities: { person_name: TmIntentMatcher.canonicalizeEntity(whoIsDoingMatch[1].trim(), "role") }
      };
    }    if (whoIsMatch) {
      return {
        intent_type: "personnel_query",
        confidence: 0.95,
        entities: { person_name: TmIntentMatcher.canonicalizeEntity(whoIsMatch[1].trim(), "role") }
      };
    }

    // Check for "where is" queries
    const whereIsMatch = q.match(/where\s+is\s+(?:the\s+)?(.+?)\??$/i);
    if (whereIsMatch) {
      return {
        intent_type: "location_query",
        confidence: 0.95,
        entities: { location_name: whereIsMatch[1].trim() }
      };
    }

    // Check for individual member notification commands
    if (/(?:notify|alert|don't notify|enable|disable).*notifications?.*for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i.test(q)) {
      const match = q.match(/for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      const memberName = match ? match[1] : null;
      
      if (memberName) {
        const enableMatch = /turn on|enable|notify|alert/.test(q);
        const disableMatch = /turn off|disable|don't notify/.test(q);
        
        let eventType = "schedule_change";
        if (/traffic|delay/i.test(q)) eventType = "traffic_delay";
        else if (/lobby/i.test(q)) eventType = "lobby_change";
        else if (/soundcheck/i.test(q)) eventType = "soundcheck_change";
        else if (/everything|all/i.test(q)) eventType = "all";
        
        return {
          intent_type: "individual_notification_management",
          confidence: 0.9,
          entities: {
            action: enableMatch ? "enable" : "disable",
            member_name: memberName,
            event_type: eventType === "all" ? "all" : `notify_on_${eventType}`
          }
        };
      }
    }

    // Check for member notification management (crew and band)
    if (/(?:notify|alert|text|message).*(?:crew|band|everyone|all|team|members?).*(?:about|when|if)/i.test(q)) {
      const enableMatch = /turn on|enable|notify|alert/.test(q);
      const disableMatch = /turn off|disable|don't notify/.test(q);
      
      let memberType = "all";
      if (/band/i.test(q)) memberType = "band";
      else if (/crew/i.test(q)) memberType = "crew";
      
      let eventType = "schedule_change";
      if (/traffic|delay/i.test(q)) eventType = "traffic_delay";
      else if (/lobby/i.test(q)) eventType = "lobby_change";
      else if (/soundcheck/i.test(q)) eventType = "soundcheck_change";
      else if (/set time|show time/i.test(q)) eventType = "set_time_change";
      else if (/meet.*greet|m&g/i.test(q)) eventType = "meet_greet";
      else if (/press|media|interview/i.test(q)) eventType = "press_commitments";
      else if (/travel|departure|flight|airport/i.test(q)) eventType = "travel_departure";
      
      return {
        intent_type: "member_notification_management",
        confidence: 0.9,
        entities: {
          action: enableMatch ? "enable" : "disable",
          member_type: memberType,
          event_type: `notify_on_${eventType}`
        }
      };
    }

    if (/(?:turn on|turn off|enable|disable|toggle).*(?:traffic|monitoring|auto.?adjust|notification)/i.test(q)) {
      const enableMatch = /turn on|enable/.test(q);
      const disableMatch = /turn off|disable/.test(q);
      return {
        intent_type: "settings_management",
        confidence: 0.9,
        entities: {
          action: enableMatch ? "enable" : (disableMatch ? "disable" : "toggle"),
          feature: q.match(/(?:traffic monitoring|auto.?adjust|notification)/i)?.[0]
        }
      };
    }

    if (/(?:set|switch|toggle|change|use).*(?:response|answer|mode).*(?:basic|expanded|detailed|brief)/i.test(q) ||
        /(?:basic|expanded|detailed|brief).*(?:mode|answers?|responses?)/i.test(q)) {
      const mode = q.match(/(?:basic|brief)/i) ? 'basic' : 'expanded';
      return {
        intent_type: "response_mode_toggle",
        confidence: 0.9,
        entities: {
          mode: mode
        }
      };
    }

    if (/(?:show|what are|check).*notifications?.*(?:settings?|status)?.*for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i.test(q)) {
      const match = q.match(/for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      const memberName = match ? match[1] : null;
      
      if (memberName) {
        return {
          intent_type: "member_notification_status",
          confidence: 0.9,
          entities: {
            member_name: memberName
          }
        };
      }
    }

    if (/(?:show|what are|check).*(?:settings|preferences|configuration)/i.test(q)) {
      return {
        intent_type: "settings_query",
        confidence: 0.9,
        entities: {}
      };
    }

    if (/(?:how long|travel time|drive time|time to get|get to).*(?:venue|airport|hotel|city|downtown)/i.test(q)) {
      let origin = null;
      let destination = null;
      let location = null;
      
      const fromToMatch = q.match(/(?:from|at)\s+(\w+)\s+to\s+(.+)$/i);
      if (fromToMatch) {
        origin = fromToMatch[1];
        destination = fromToMatch[2];
        if (destination && destination.match(/\w+\s+show$/i)) {
          location = destination.replace(/\s*show$/i, "");
          destination = "venue";
        }
        if (destination && destination.includes("airport")) {
          const airportMatch = destination.match(/airport\s+in\s+(\w+)/i);
          if (airportMatch) {
            location = airportMatch[1];
          }
          destination = "airport";
        }
      } else if (q.includes("airport")) {
        destination = "airport";
        origin = "hotel";
      }
      
      const locationMatch = q.match(/(?:for|in|at|to)\s+(?:the\s+)?(?:venue\s+)?(?:for|in|at)?\s*(\w+)$/i);
      if (locationMatch) {
        location = locationMatch[1];
      }
      
      return {
        intent_type: "travel_time_query",
        confidence: 0.9,
        entities: {
          query_type: "duration",
          location: location,
          destination: destination,
          origin: origin
        }
      };
    }

    // Dynamic city-based matching using known cities
    const dataSource = require("./csvDataSource");
    const csvData = dataSource.createCsvDataSource({ dataDir: "./data" });
    try {
      if (/list.*shows?|all shows?|show list|schedule|showtime|what time.*show|(^|\s)show(s)?(\s|$)/.test(q)) {
        intent = { intent_type: 'show_schedule', confidence: 0.95, entities: {} };
      } else if (/load in|load-out|sound.?check|curfew|setlist/.test(q)) {
        intent = { intent_type: 'production', confidence: 0.9, entities: {} };
      } else if (/flight|airport|travel|hotel|check[- ]?in|check[- ]?out/.test(q)) {
        intent = { intent_type: 'travel', confidence: 0.9, entities: {} };
      } else if (/merch|merchandise|t[- ]?shirts?|hoodies?|seller|stand/.test(q)) {
        intent = { intent_type: 'merch', confidence: 0.9, entities: {} };
      } else if (/budget|costs?|expenses?|financial|accounting|invoice|payment/.test(q)) {
        intent = { intent_type: 'financial', confidence: 0.9, entities: {} };
      } else if (/press|media|interview|photographer|photo\s?pass|press commitments?/.test(q)) {
        intent = { intent_type: 'media', confidence: 0.9, entities: {} };
      } else if (/(?:create|add|schedule|new|book)\s+(?:event|meeting|appointment)/i.test(q)) {
        intent = { intent_type: "create_event", confidence: 0.95, entities: this.extractEventEntities(q) };
      } else if (/^(help|what can i ask|what can you do)/.test(q)) {
        intent = { intent_type: 'help', confidence: 0.99, entities: {} };
      }
    } catch (e) {
      intent = {
        intent_type: null,
        confidence: 0,
        entities: {},
        original_query: content,
        error: String(e?.message || e),
      };
    }

    // Term lookup as fallback - only when no specific intent matched
    const normQuery = normalize(q);
    let hit = lookupExact(normQuery) || lookupInSentence(normQuery);

    if (!hit) {
      const m = q.match(/^(what is|what's|define|meaning of)\s+(.+)$/i);
      if (m && m[2]) {
        const cand = normalize(m[2]);
        hit = lookupExact(cand) || lookupInSentence(cand);
      }
    }

    if (hit && intent.intent_type === null) {
      intent = {
        intent_type: "term_lookup",
        confidence: 0.99,
        entities: { term_id: hit.term_id, term: hit.term || hit.key || null }
      };
    }

    // Semantic re-ranking: compare intent entities with parseMessage entities

    if (intent && intent.intent_type && intent.confidence > 0) {
      try {
        const tmAiEngine = require("./tmAiEngine");
        const parsed = tmAiEngine.parseMessage(content);
        const intentEntities = intent.entities ? Object.values(intent.entities).filter(v => v) : [];
        const overlap = parsed.entities.filter(e => intentEntities.includes(e));
        
        if (overlap.length === 0 && parsed.entities.length > 0) {
          intent.confidence *= 0.8;
          if (intent.confidence < 0.6) {
            intent.intent_type = "term_lookup_fallback";
          }
        }
      } catch (e) {
        // Semantic re-ranking failed, continue with original intent
      }
    }

    return intent;
  }


  extractEventEntities(q) {
    const entities = {};
    
    // Extract event description/type
    const eventMatch = q.match(/(?:create|add|schedule|new|book)\s+(?:a\s+)?([^\s]+(?:\s+[^\s]+)*?)(?:\s+for|\s+at|\s+in|\s+tomorrow|\s+today|$)/i);
    if (eventMatch) {
      entities.description = eventMatch[1].trim();
    }
    
    // Extract member assignments
    const memberMatch = q.match(/for\s+(.*?)(?:\s+at|\s+in|\s+tomorrow|\s+today|$)/i);
    if (memberMatch) {
      entities.assigned_members = memberMatch[1].trim();
    }
    
    // Extract time/date
    const timeMatch = q.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (timeMatch) {
      entities.time = timeMatch[1].trim();
    }
    
    const dateMatch = q.match(/\b(today|tomorrow|\d{4}-\d{2}-\d{2})\b/i);
    if (dateMatch) {
      entities.date = dateMatch[1].trim();
    }
    
    // Extract location
    // Extract location (exclude time patterns)
    const locationMatch = q.match(/(?:in|at)\s+([a-zA-Z][^\s]*(?:\s+[a-zA-Z][^\s]*)*)(?:\s+at|\s+for|\s+tomorrow|\s+today|$)/i);
    if (locationMatch) {
      entities.location = locationMatch[1].trim();
    }
    
    return entities;
  }

}

module.exports = new TmIntentMatcher();
