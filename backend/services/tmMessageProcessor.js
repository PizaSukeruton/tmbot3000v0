// backend/services/tmMessageProcessor.js
// Orchestrates message handling: match intent, generate AI response, persist to DB.

const pool = require('../db/pool');
const tmIntentMatcher = require('./tmIntentMatcher');
const aiEngine = require('./tmAiEngine');
const NextStepLogicFilter = require('./tmNextStepLogic');
const path = require('path');
const { createCsvDataSource } = require('./csvDataSource');

class TmMessageProcessor {
  constructor() {
    this.pool = pool;
    this.intentMatcher = tmIntentMatcher;
    this.aiEngine = aiEngine;
    
    // Initialize CSV data source and Next Step Logic
    this.csvDataSource = createCsvDataSource({ dataDir: path.join(__dirname, '..', 'data') });
    this.nextStepFilter = new NextStepLogicFilter(this.csvDataSource, pool);
    
    // Session storage for context
    this.sessions = new Map();
  }

  /**
   * Main entry: process one inbound message.
   * @param {string} content
   * @param {object} convoContext
   * @param {object} member
   */
  async processMessage(content, convoContext, member) {
    let intent, aiResponse;
    
    // Get or create session
    const session = this.getSession(member.member_id);

    // Check if this is a confirmation response to a pending query
    console.log("[DEBUG] Checking confirmation - pendingQuery exists:", !!session.pendingQuery);
    console.log("[DEBUG] typeof this.isConfirmationResponse:", typeof this.isConfirmationResponse);
    console.log("[DEBUG] this keys:", Object.keys(this));
    if (session.pendingQuery) {
      const isConfirmation = await this.isConfirmationResponse(content);
      console.log("[DEBUG] isConfirmation result:", isConfirmation);
      if (isConfirmation) {
        return this.handleConfirmation(member.member_id, content, convoContext, member);
      }

  }
    // ---- Intent stage ----
    try {
      intent = await this.intentMatcher.matchIntent(
        content,
        { last_entities: this.pickLastEntities(convoContext) },
        member
      );
      console.log("[MESSAGE-PROCESSOR] Matched intent:", JSON.stringify(intent));
    } catch (err) {
      console.error('[MESSAGE-PROCESSOR] Intent match failed:', err.message);
      // Optionally return an error response or proceed with a default intent
      intent = { type: 'unknown', confidence: 0, entities: {} };
    }

    // ---- Next Step Logic Filter ----
    const filteredData = await this.nextStepFilter.filter({
      intent: intent,
      query: content,
      entities: intent.entities || {},
      sessionContext: session.context || {}
    });
    console.log("[MESSAGE-PROCESSOR] Filtered data:", JSON.stringify(filteredData));

    // Check if we need confirmation
    if (filteredData.nextStepProcessed && filteredData.needsConfirmation) {
      // Store pending query in session
      session.pendingQuery = {
        ...filteredData,
        originalIntent: intent,
        originalQuery: content
      };
      
      // Generate response with assumed context
      const response = await this.aiEngine.generateResponse({
        message: content,
        intent: {...intent, assumedContext: filteredData.assumedContext, needsConfirmation: filteredData.needsConfirmation},
        context: convoContext,
        member,
        session: session
      });
      
      // Only add confirmation prompt if response seems incomplete
      if (filteredData.needsConfirmation && response.type !== "travel_info" && 
          response.type !== "venue_info" && response.type !== "personnel") {
        const finalResponse = {
          ...response,
          text: filteredData.confirmationPrompt ? `${response.text}\n\n${filteredData.confirmationPrompt}` : response.text
        };
        return { intent, aiResponse: finalResponse };
      }
      
      // Store context if provided by AI response
      if (response.context && session) {
        session.context = response.context;
        console.log("[MESSAGE-PROCESSOR] Stored context in session:", session.context);
      }
      
      return { intent, aiResponse: response };
    }

    // ---- AI Response stage ----
    try {
      if (!this.aiEngine || !this.aiEngine.generateResponse) {
        throw new Error('AI Engine not properly initialized');
      }
      
      // Use filtered data if available, otherwise use original intent
      const processedIntent = filteredData.assumedContext ? 
        { ...intent, context: filteredData.assumedContext } : 
        intent;
      
      // Pass session context to AI engine
      aiResponse = await this.aiEngine.generateResponse({
        message: content,
        intent: processedIntent,
        context: { ...convoContext, sessionContext: session.context || {} },
        member,
        session: session
      });
      
      // Store context if provided by AI response
      if (aiResponse.context && session) {
        session.context = aiResponse.context;
        console.log("[MESSAGE-PROCESSOR] Stored context in session:", session.context);
      }
    } catch (err) {
      console.error('[MESSAGE-PROCESSOR] AI generation failed:', err.message);
      aiResponse = {
        text: "I'm having trouble processing your request. Please try again.",
        type: 'error'
      };
    }

    return { intent, aiResponse };
  }
  
  // Check if message is likely a confirmation response
  async isConfirmationResponse(message) {
    console.log("[DEBUG] Entered isConfirmationResponse with:", message);
    const text = message.trim().toLowerCase();
    
    // Fast check for static confirmations
    const staticConfirmations = ["yes", "yeah", "yep", "no", "nope", "correct", "wrong", "right", "incorrect", "exactly", "different", "other"];
    if (staticConfirmations.includes(text)) return true;
    
    // Cached city pattern
    if (!this.cityPatternCache) {
      const rawCities = await this.csvDataSource.getCities();
      console.log("Cities raw:", rawCities.map(c => [...c].map(ch => ch.charCodeAt(0))));
      const cities = rawCities.map(c => c
        .trim() // remove hidden spaces/newlines
        .replace(/\r/g, "") // handle CRLF endings
        .normalize("NFKC") // Unicode normalization
      );
      this.cityPatternCache = new RegExp(`^(${cities.join("|")})$`, "i");
      console.log("Pattern test for 'brisbane':", this.cityPatternCache.test("brisbane"));
    }
    
    return this.cityPatternCache.test(text);
  }  
  // Handle confirmation responses
  async handleConfirmation(memberId, message, convoContext, member) {
    const session = this.getSession(memberId);
    const pendingQuery = session.pendingQuery;
    if (!pendingQuery) return this.processMessage(message, convoContext, member);

    const text = message.trim().toLowerCase();

    // Check if message is a city confirmation (not yes/no)
    const cities = await this.csvDataSource.getCities();
    const matchedCity = cities.find(c => c.toLowerCase() === text);

    // 1️⃣ City confirmation branch
    if (matchedCity && pendingQuery.originalIntent.intent_type === "personnel_query") {
      console.log(`[CONFIRMATION] Matched city confirmation: ${matchedCity}`);

      // Retrieve city-specific personnel for the pending role
      const role = pendingQuery.originalIntent.entities?.person_name ||
                   pendingQuery.entities?.role ||
                   "FOH Tech"; // fallback
      const personnelList = await this.csvDataSource.checkPersonnelAcrossShows(role);

      // Filter by matched city
      const cityResult = personnelList.find(p =>
        p.city.toLowerCase() === matchedCity.toLowerCase()
      );

      if (cityResult) {
        const responseText =
          `The ${role} in ${matchedCity} is ${cityResult.name} - ${cityResult.contact || "no contact listed"}.`;
        session.pendingQuery = null;
        return {
          intent: pendingQuery.originalIntent,
          aiResponse: { text: responseText, type: "personnel" }
        };
      }

      // No direct record found
      return {
        intent: { type: "clarification" },
        aiResponse: {
          text: `I could not find a ${role} listed for ${matchedCity}.`,
          type: "clarification"
        }
      };
    }

    // 2️⃣ Default yes/no confirmation logic (existing)
    const result = await this.nextStepFilter.handleConfirmation(
      message,
      pendingQuery.originalQuery,
      pendingQuery.assumedContext
    );

    if (result.confirmed) {
      session.context = result.context;
      const response = await this.aiEngine.generateResponse({
        message: pendingQuery.originalQuery,
        intent: { ...pendingQuery.originalIntent, context: result.context, confirmed: true },
        context: convoContext,
        member,
        session
      });
      session.pendingQuery = null;
      return { intent: pendingQuery.originalIntent, aiResponse: response };
    } else if (result.confirmed === false) {
      return {
        intent: { type: "clarification" },
        aiResponse: { text: result.prompt, type: "clarification" }
      };
    }

    return {
      intent: { type: "clarification" },
      aiResponse: { text: result.prompt, type: "clarification" }
    };
  }  
  // Session management
  getSession(memberId) {
    if (!this.sessions.has(memberId)) {
      this.sessions.set(memberId, {
        memberId,
        responseMode: 'basic', // default to basic mode
        context: {},
        pendingQuery: null,
        lastActivity: new Date()
      });
    }
    
    const session = this.sessions.get(memberId);
    session.lastActivity = new Date();
    return session;
  }

  pickLastEntities(convoContext) {
    // Pick last entities from conversation context
    if (!convoContext || !convoContext.messages || convoContext.messages.length === 0) {
      return {};
    }
    
    const lastMessage = convoContext.messages[convoContext.messages.length - 1];
    return lastMessage.entities || {};
  }
}

module.exports = new TmMessageProcessor();
