// backend/services/tmNextStepLogic.js

class NextStepLogicFilter {
  constructor() {
    // Intent types that typically need additional conversational context
    this.contextDependentIntents = new Set([
      "travel_time_query",
      "personnel_query",
      "schedule_query",
      "location_query",
      "logistics_query",
      "venue_query"
    ]);
  }

  // === Primary Filtering Logic ===
  async filter(queryData) {
    const { intent, query, entities, sessionContext = {} } = queryData;
    let filteredData = queryData;

    // Step 1: Assess if this intent type normally requires context
    const needsContext = this.assessContextNeed(intent, query);
    if (needsContext && typeof needsContext === "object" && needsContext.needsConfirmation) {
      console.log("[DEBUG] >>> needsContext contained confirmation data <<<");
      filteredData.nextStepProcessed = true;
      filteredData.needsConfirmation = true;
      return filteredData;
    }

    // Step 2: Does an adequate context already exist?
    const hasContext = this.hasAdequateContext(query, entities, sessionContext, intent);

    if (hasContext) {
      return {
        ...queryData,
        nextStepProcessed: false
      };
    }

    // Step 3: Enrich the query with default context, if needed
    const enrichedData = await this.enrichWithDefaults(queryData);

    return {
      ...enrichedData,
      nextStepProcessed: true,
      needsConfirmation: true
    };
  }

  // === Determine whether an intent type needs context ===
  assessContextNeed(intent, query) {
    if (!intent || !intent.intent_type) return false;
    if (this.contextDependentIntents.has(intent.intent_type)) {
      return {
        needsConfirmation: true,
        suggestedResponse: "Please specify which venue you're asking about."
      };
    }
    return false;
  }
  // === Example placeholder for contextual adequacy check ===
  hasAdequateContext(query, entities, sessionContext, intent) {
    // Basic skeleton logic; extend as needed
    return Boolean(entities && Object.keys(entities).length > 0);
  }

  // === Example placeholder for enriching data ===
  async enrichWithDefaults(queryData) {
    // Simulate data enrichment
    return {
      ...queryData,
      enriched: true
    };
  }
}

module.exports = NextStepLogicFilter;

