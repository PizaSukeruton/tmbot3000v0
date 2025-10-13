// tmNextStepLogic.js - Universal filter that processes ALL queries for missing context

class NextStepLogicFilter {
  constructor(csvDataSource, dbPool) {
    this.csvDataSource = csvDataSource;
    this.dbPool = dbPool;
    
    // Define patterns that indicate context is already present (agnostic)
    this.contextIndicators = {
      temporal: [
        /\b(today|tomorrow|tonight|yesterday)\b/i,
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
        /\b(next|last|this|previous|upcoming)\s+(show|gig|week|month)\b/i,
        /\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/,  // Date patterns
        /\b\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\b/          // ISO dates
      ],
      referential: [
        /\bshow\s*#?\w+\b/i,      // Show ID reference
        /\bvenue\s*#?\w+\b/i,     // Venue ID reference
        /\b(that|this|the)\s+(show|venue|gig)\b/i,
        /\b(same|different)\s+(venue|location|place)\b/i
      ]
    };
    
    // Intent types that typically need context
    this.contextDependentIntents = new Set([
      'venue_query',
      'travel_time_query',
      'personnel_query',
      'schedule_query',
      'location_query',
      'logistics_query'
    ]);  }

  // Main filter method - processes EVERY query through the pipeline
  async filter(queryData) {
    const { intent, query, entities, sessionContext = {} } = queryData;
    
    // Step 1: Does this type of query typically need context?
    const needsContext = this.assessContextNeed(intent, query);
    
    if (!needsContext) {
      return {
        ...queryData,
        nextStepProcessed: false
      };
    }
    
    // Step 2: Is sufficient context already present?
    const hasContext = this.hasAdequateContext(query, entities, sessionContext);
    
    if (hasContext) {
      return {
        ...queryData,
        nextStepProcessed: false
      };
    }
    
    // Step 3: Apply next step logic - add default context
    const enrichedData = await this.enrichWithDefaults(queryData);
    
    return {
      ...enrichedData,
      nextStepProcessed: true,
      needsConfirmation: true
    };
  }

  // Determine if this query type needs context
  assessContextNeed(intent, query) {
    console.log("[NEXTSTEP] Assessing context need for:", intent.intent_type, "in set?", this.contextDependentIntents.has(intent.intent_type));    // Check if it's a known context-dependent intent
    if (this.contextDependentIntents.has(intent.intent_type)) {
      return true;
    }
    
    // Check for context-requiring keywords in the query
    // If the intent already specifies a location, no need for default context
    if (intent.intent_type === "location_specific_query") {
      return false;
    }
    const contextKeywords = [
      /\b(when|what time|where|which)\b/i,
      /\b(venue|show|soundcheck|load.?in|call time)\b/i,
      /\b(contact|address|location|parking)\b/i
    ];
    
    return contextKeywords.some(pattern => pattern.test(query));
  }

  // Check if query already has adequate context
  hasAdequateContext(query, entities, sessionContext) {
    console.log("[NEXTSTEP] Checking adequate context - query:", query, "entities:", entities, "sessionContext:", sessionContext);    // Check temporal indicators
    
    // For venue_query, we need a specific venue context, not just the word "venue"
    if (entities && entities.query_type && !entities.venue_id && !sessionContext.currentVenue) {
      console.log("[NEXTSTEP] Query needs venue context but has none");
      return false;
    // For personnel queries, check if location is already specified
    if (intent.intent_type === "personnel_query") {
      const locationPattern = /\b(in|at|for)\s+\w+/i;
      if (locationPattern.test(query)) {
        console.log("[NEXTSTEP] Personnel query already has location context");
        return true;
      }
    }
    }    const hasTimeContext = this.contextIndicators.temporal.some(pattern => 
      pattern.test(query)
    );
    
    // Check referential indicators
    const hasReference = this.contextIndicators.referential.some(pattern => 
      pattern.test(query)
    );
    
    // Check if entities already contain IDs
    const hasEntityContext = entities && (
      entities.show_id || 
      entities.venue_id || 
      entities.date
    );
    
    // Check session context
    const hasSessionContext = sessionContext.currentShow || sessionContext.currentVenue;
    
    return hasTimeContext || hasReference || hasEntityContext || hasSessionContext;
  }

  // Enrich query with intelligent defaults
  async enrichWithDefaults(queryData) {
    // Get the next upcoming show as the default context
    const nextShow = await this.csvDataSource.getNextShow();
    
    if (!nextShow) {
      return {
        ...queryData,
        noUpcomingShows: true,
        suggestedResponse: "There are no upcoming shows scheduled. Which show were you asking about?"
      };
    }
    
    // Format a user-friendly date string
    const showDate = new Date(nextShow.date);
    const dateString = this.formatDateString(showDate);
    
    // Add the default context
    return {
      ...queryData,
      assumedContext: {
        show_id: nextShow.show_id,
        venue_id: nextShow.venue_id,
        venue_name: nextShow.venue_name,
        date: nextShow.date,
        dateString: dateString,
        city: nextShow.city
      },
      confirmationPrompt: `You didn't specify which show, so I'm assuming you mean the next show - ${dateString} at ${nextShow.venue_name}. Is this correct?`
    };
  }

  // Format date in a friendly way
  formatDateString(date) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check if it's today
    if (date.toDateString() === now.toDateString()) {
      return "today's";
    }
    
    // Check if it's tomorrow
    if (date.toDateString() === tomorrow.toDateString()) {
      return "tomorrow's";
    }
    
    // Otherwise return the date
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-AU', options);
  }
  
  // Handle confirmation responses
  async handleConfirmation(response, originalQuery, assumedContext) {
    const positiveResponses = /^(yes|yeah|yep|correct|right|that's right|exactly)$/i;
    const negativeResponses = /^(no|nope|wrong|different|not that one)$/i;
    
    if (positiveResponses.test(response.trim())) {
      return {
        confirmed: true,
        context: assumedContext,
        action: 'proceed'
      };
    }
    
    if (negativeResponses.test(response.trim())) {
      return {
        confirmed: false,
        action: 'request_clarification',
        prompt: 'Which show were you asking about?'
      };
    }
    
    // Response wasn't clear yes/no
    return {
      confirmed: null,
      action: 'unclear',
      prompt: 'I\'m not sure if that\'s a yes or no. Can you clarify which show you\'re asking about?'
    };
  }
}

module.exports = NextStepLogicFilter;
