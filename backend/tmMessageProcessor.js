// backend/services/tmMessageProcessor.js
// Final verified clean version – fixes 'Unexpected token :'

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
    this.csvDataSource = createCsvDataSource({ dataDir: path.join(__dirname, '..', 'data') });
    this.nextStepFilter = new NextStepLogicFilter(this.csvDataSource, pool);
    this.sessions = new Map();
  }

  async processMessage(content, convoContext, member) {
    let intent, aiResponse;
    const session = this.getSession(member.member_id);

    if (session.pendingQuery) {
      const isConfirmation = await this.isConfirmationResponse(content);
      if (isConfirmation) {
        return this.handleConfirmation(member.member_id, content, convoContext, member);
      }
    }

    try {
      intent = await this.intentMatcher.matchIntent(
        content,
        { last_entities: this.pickLastEntities(convoContext) },
        member
      );
    } catch (err) {
      console.error('[MESSAGE-PROCESSOR] Intent match failed:', err.message);
      intent = { type: 'unknown', confidence: 0, entities: {} };
    }

    const filteredData = await this.nextStepFilter.filter({
      intent,
      query: content,
      entities: intent.entities || {},
      sessionContext: session.context || {}
    });

    if (filteredData.nextStepProcessed && filteredData.needsConfirmation) {
      session.pendingQuery = {
        ...filteredData,
        originalIntent: intent,
        originalQuery: content
      };

      const response = await this.aiEngine.generateResponse({
        message: content,
        intent: { ...intent, assumedContext: filteredData.assumedContext },
        context: convoContext,
        member,
        session
      });

      const finalResponse = {
        ...response,
        text: filteredData.confirmationPrompt
          ? `${response.text}\n\n${filteredData.confirmationPrompt}`
          : response.text
      };

      return { intent, aiResponse: finalResponse };
    }

    try {
      aiResponse = await this.aiEngine.generateResponse({
        message: content,
        intent,
        context: { ...convoContext, sessionContext: session.context || {} },
        member,
        session
      });
      if (aiResponse.context && session) session.context = aiResponse.context;
    } catch (err) {
      console.error('[MESSAGE-PROCESSOR] AI generation failed:', err.message);
      aiResponse = { text: "I'm having trouble processing your request.", type: 'error' };
    }

    return { intent, aiResponse };
  }

  async isConfirmationResponse(message) {
    const text = message.trim().toLowerCase();
    const confirmWords = ["yes","yeah","yep","no","nope","correct"];
    if (confirmWords.includes(text)) return true;

    if (!this.cityPatternCache) {
      const rawCities = await this.csvDataSource.getCities();
      const cleanCities = rawCities.map(c => c.trim().replace(/\r/g,"").normalize("NFKC"));
      this.cityPatternCache = new RegExp(`^(${cleanCities.join("|")})$`,"i");
    }
    return this.cityPatternCache.test(text);
  }

  async handleConfirmation(memberId, message, convoContext, member) {
    const session = this.getSession(memberId);
    const pendingQuery = session.pendingQuery;
    if (!pendingQuery) return this.processMessage(message, convoContext, member);

    const text = message.trim().toLowerCase();
    const cities = await this.csvDataSource.getCities();
    const matchedCity = cities.find(c => c.toLowerCase() === text);

    if (matchedCity) {
      const intentType = pendingQuery.originalIntent.intent_type;

      switch (intentType) {
        case "personnel_query": {
          const role =
            pendingQuery.originalIntent.entities?.person_name ||
            pendingQuery.entities?.role ||
            "FOH Tech";

          const personnelList = await this.csvDataSource.checkPersonnelAcrossShows(role);
          const cityMatch = personnelList.find(
            p => p.city.toLowerCase() === matchedCity.toLowerCase()
          );

          if (cityMatch) {
            const responseText = `The ${role} in ${matchedCity} is ${cityMatch.name} - ${
              cityMatch.contact || "no contact listed"
            }.`;
            session.pendingQuery = null;
            return {
              intent: pendingQuery.originalIntent,
              aiResponse: { text: responseText, type: "personnel" }
            };
          }

          return {
            intent: { type: "clarification" },
            aiResponse: {
              text: `I could not find a ${role} listed for ${matchedCity}.`,
              type: "clarification"
            }
          };
        }

        case "venue_query": {
          const venueData = await this.csvDataSource.getVenueByCity(matchedCity);
          if (venueData) {
            const responseText = `The venue contact for ${venueData.name} in ${matchedCity} is ${venueData.contact_name} - ${venueData.contact_phone} (${venueData.contact_email}).`;
            session.pendingQuery = null;
            return {
              intent: pendingQuery.originalIntent,
              aiResponse: { text: responseText, type: "venue_info" }
            };
          }
          return {
            intent: { type: "clarification" },
            aiResponse: {
              text: `I could not find venue information for ${matchedCity}.`,
              type: "clarification"
            }
          };
        }

        default:
          break;
      }
    }

    const result = await this.nextStepFilter.handleConfirmation(
      message,
      pendingQuery.originalQuery,
      pendingQuery.assumedContext
    );

    if (result.confirmed) {
      session.context = result.context;
      const response = await this.aiEngine.generateResponse({
        message: pendingQuery.originalQuery,
        intent: {
          ...pendingQuery.originalIntent,
          context: result.context,
          confirmed: true
        },
        context: convoContext,
        member,
        session
      });
      session.pendingQuery = null;
      return { intent: pendingQuery.originalIntent, aiResponse: response };
    }

    return {
      intent: { type: "clarification" },
      aiResponse: { text: result.prompt, type: "clarification" }
    };
  }

  getSession(memberId) {
    if (!this.sessions.has(memberId)) {
      this.sessions.set(memberId, {
        memberId,
        responseMode: 'basic',
        context: {},
        pendingQuery: null,
        lastActivity: new Date()
      });
    }
    const s = this.sessions.get(memberId);
    s.lastActivity = new Date();
    return s;
  }

  pickLastEntities(convoContext) {
    if (!convoContext?.messages?.length) return {};
    const lastMessage = convoContext.messages.at(-1);
    return lastMessage.entities || {};
  }
}

module.exports = new TmMessageProcessor();
