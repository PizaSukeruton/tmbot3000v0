const intents = require('./tmIntentMatcher');
const NextStepLogicFilter = require("./tmNextStepLogic");
const nextStepFilter = new NextStepLogicFilter();
const aiEngine = require('./tmAiEngine');

class TmMessageProcessor {
  constructor() {
    this.intents = intents;
    this.nextStepFilter = nextStepFilter;
    this.aiEngine = aiEngine;
    
    // Session management - CRITICAL FIX: Ensure persistent sessions Map
    this.sessions = new Map();
    console.log('[MESSAGE-PROCESSOR] Initialized with persistent sessions map');
  }

  async processMessage(content, convoContext, member) {
    let intent, aiResponse;
    
    // Get or create session - must return SAME session object across requests
    const session = this.getSession(member.member_id);
    
    console.log(`[MESSAGE-PROCESSOR] Session for ${member.member_id}:`, {
      hasPendingQuery: !!session.pendingQuery,
      pendingQueryType: session.pendingQuery?.originalIntent?.intent_type,
      totalSessions: this.sessions.size
    });

    // Check if this is a confirmation response to a pending query
    if (session.pendingQuery && this.isConfirmationResponse(content)) {
      console.log('[MESSAGE-PROCESSOR] Detected confirmation response');
      return this.handleConfirmation(member.member_id, content, convoContext, member);
    }

    // Intent stage
    try {
      intent = await this.intents.matchIntent(content, {}, member);
    } catch (err) {
      console.error('[MESSAGE-PROCESSOR] Intent matching failed:', err.message);
      intent = {
        intent_type: 'error',
        confidence: 0,
        entities: {},
        error: err.message
      };
    }

    console.log("[MESSAGE-PROCESSOR] Matched intent:", JSON.stringify(intent));

    // NextStep Filter stage
    let filteredData = null;
    try {
      filteredData = await this.nextStepFilter.filter({
        intent,
        query: content,
        entities: intent.entities || {},
        sessionContext: session.context || {}
      });
      
      console.log("[MESSAGE-PROCESSOR] Filtered data:", JSON.stringify(filteredData));
    } catch (err) {
      console.error('[MESSAGE-PROCESSOR] NextStep filtering failed:', err);
    }

    // Store pending query if needs confirmation
    if (filteredData && filteredData.needsConfirmation) {
      console.log('[MESSAGE-PROCESSOR] Storing pending query');
      
      session.pendingQuery = {
        intent: filteredData.intent || intent,
        query: filteredData.query || content,
        entities: filteredData.entities || intent.entities,
        sessionContext: filteredData.sessionContext || {},
        confirmationPrompt: filteredData.confirmationPrompt,
        assumedContext: filteredData.assumedContext,
        originalIntent: intent,
        originalQuery: content
      };
      
      console.log('[MESSAGE-PROCESSOR] Stored pending query:', {
        originalIntent: session.pendingQuery.originalIntent.intent_type,
        originalQuery: session.pendingQuery.originalQuery
      });
      
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
      
      if (response.context && session) {
        session.context = response.context;
        console.log("[MESSAGE-PROCESSOR] Stored context in session:", session.context);
      }
      
      return { intent, aiResponse: response };
    }

    // AI Response stage
    try {
      if (!this.aiEngine || !this.aiEngine.generateResponse) {
        throw new Error('AI Engine not properly initialized');
      }
      
      const processedIntent = filteredData && filteredData.assumedContext ? 
        { ...intent, context: filteredData.assumedContext } : 
        intent;
      
      aiResponse = await this.aiEngine.generateResponse({
        message: content,
        intent: processedIntent,
        context: { ...convoContext, sessionContext: session.context || {} },
        member,
        session: session
      });
      
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
  
  // Enhanced confirmation detection - now includes city names
  isConfirmationResponse(message) {
    const confirmationPatterns = [
      /^(yes|no|yeah|nope|yep|nah)$/i,
      /^(correct|wrong|right|incorrect)$/i,
      /^(that's right|that's wrong|that's it|not that one)$/i,
      /^(exactly|different|other)$/i
    ];
    
    // Also check for city names as confirmation responses
    // Get cities dynamically from CSV data instead of hardcoding
    // Check if message is a city name by checking CSV data
    const isLocation = this.isLocationName(message.trim());    const isConfirmation = confirmationPatterns.some(pattern => pattern.test(message.trim()));
    
    console.log('[MESSAGE-PROCESSOR] Confirmation check:', {
      message: message.trim(),
      isConfirmation,
      isLocation,
      result: isConfirmation || isLocation
    });
    
    return isConfirmation || isLocation;
  }
  
  // Handle confirmation of a pending query
  async handleConfirmation(memberId, content, convoContext, member) {
    const session = this.getSession(memberId);
    const pendingQuery = session.pendingQuery;
    
    console.log('[MESSAGE-PROCESSOR] Handling confirmation:', {
      memberId,
      content,
      hasPendingQuery: !!pendingQuery,
      pendingQueryType: pendingQuery?.originalIntent?.intent_type
    });
    
    if (!pendingQuery) {
      console.log('[MESSAGE-PROCESSOR] No pending query, processing as normal');
      return this.processMessage(content, convoContext, member);
    }
    
    const isLocation = /^(melbourne|sydney|brisbane|adelaide|perth|canberra|darwin|hobart)$/i.test(content.trim());
    
    if (isLocation && pendingQuery.originalIntent.intent_type === 'personnel_query') {
      console.log('[MESSAGE-PROCESSOR] Location provided for personnel query');
      
      // Create enhanced query combining original personnel query with location
      const enhancedQuery = `${pendingQuery.originalQuery} in ${content.trim()}`;
      
      console.log('[MESSAGE-PROCESSOR] Enhanced query:', enhancedQuery);
      
      const enhancedIntent = {
        ...pendingQuery.originalIntent,
        entities: {
          ...pendingQuery.originalIntent.entities,
          location: content.trim().toLowerCase()
        }
      };
      
      // Clear pending query before processing
      session.pendingQuery = null;
      
      // Generate response with location context
      const response = await this.aiEngine.generateResponse({
        message: enhancedQuery,
        intent: enhancedIntent,
        context: convoContext,
        member,
        session: session
      });
      
      return { intent: enhancedIntent, aiResponse: response };
    }
    
    // Fallback for unclear responses
    return {
      intent: { type: 'clarification' },
      aiResponse: {
        text: "I'm not sure I understand. Can you tell me which show you're asking about?",
        type: 'clarification'
      }
    };
  }
  
  // Session management - CRITICAL: Must be persistent across requests
  getSession(memberId) {
    if (!this.sessions.has(memberId)) {
      console.log(`[MESSAGE-PROCESSOR] Creating new session for ${memberId}`);
      this.sessions.set(memberId, {
        memberId,
        responseMode: 'basic',
        context: {},
        pendingQuery: null,
        lastActivity: new Date()
      });
    } else {
      console.log(`[MESSAGE-PROCESSOR] Retrieved existing session for ${memberId}`);
    }
    
    const session = this.sessions.get(memberId);
    session.lastActivity = new Date();
    
    console.log(`[MESSAGE-PROCESSOR] Session state:`, {
      memberId: session.memberId,
      hasPendingQuery: !!session.pendingQuery,
      responseMode: session.responseMode,
      totalSessions: this.sessions.size
    });
    
    return session;
  }
  
  // Check if message is a city name using AI engine's loaded cities
  isLocationName(message) {
    const cities = this.aiEngine.cities || [];
    return cities.includes(message.toLowerCase());
  }

  cleanupSessions() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [memberId, session] of this.sessions.entries()) {
      if (session.lastActivity < oneHourAgo) {
        this.sessions.delete(memberId);
      }
    }
  }
}

// CRITICAL: Export singleton instance, not the class
module.exports = new TmMessageProcessor();

  // Simple location name checker using basic Australian cities

  // Check if message is a city name using AI engine's loaded cities
