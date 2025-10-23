const EventManager = require('./eventManager');
const EventConversation = require('./eventConversation');

class NaturalLanguageEventCreator {
  constructor(eventManager) {
    this.eventManager = eventManager || new EventManager();
    this.eventConversation = new EventConversation(this.eventManager);
  }

  async processNaturalLanguageRequest(entities, sessionId, userId) {
    try {
      // Check if we have minimum required information
      const hasDescription = entities.description && entities.description.trim();
      
      if (!hasDescription) {
        // Not enough info - fall back to step-by-step EventConversation
        return await this.eventConversation.handleMessage(sessionId, "create event", userId);
      }

      // We have enough info - pre-fill the EventConversation state
      const state = this.eventConversation.getState(sessionId);
      
      // Pre-fill all the data we extracted
      state.data.description = entities.description.trim();
      state.data.created_by = userId;
      
      // Process date
      if (entities.date) {
        const parsedDate = this.eventManager.parseNaturalDate(entities.date);
        if (parsedDate) {
          state.data.date = parsedDate;
        }
      }
      
      // Process time  
      if (entities.time) {
        const parsedTime = this.eventManager.parseNaturalTime(entities.time);
        if (parsedTime) {
          state.data.time = parsedTime;
        }
      }
      
      // Process location
      if (entities.location) {
        state.data.location = entities.location.trim();
      }
      
      // Process member assignments
      if (entities.assigned_members) {
        state.data.assigned_members = await this.processMemberAssignments(entities.assigned_members);
      }
      
      // Check what's still missing and set appropriate step
      if (!state.data.date) {
        state.step = 'date';
        return {
          message: 'What date is this event? (e.g., "tomorrow", "today")',
          complete: false
        };
      } else if (!state.data.time) {
        state.step = 'time';
        return {
          message: 'What time does it start? (e.g., "2pm", "14:00")',
          complete: false
        };
      } else if (!state.data.location) {
        state.step = 'location';
        return {
          message: 'Where is this event?',
          complete: false
        };
      } else {
        // We have everything - jump to confirmation
        state.step = 'confirm';
        const summary = this.eventConversation.generateSummary(state.data);
        
        return {
          message: `I understood your request! Here's the event summary:\n\n${summary}\n\nType "confirm" to create this event, or "cancel" to abort.`,
          complete: false
        };
      }

    } catch (error) {
      // Error occurred - fall back to step-by-step
      return await this.eventConversation.handleMessage(sessionId, "create event", userId);
    }
  }

  async processMemberAssignments(assignmentText) {
    const text = assignmentText.toLowerCase().trim();
    
    // Handle group assignments
    if (text.includes('all crew') || text.includes('crew')) {
      return 'all_crew';
    }
    if (text.includes('all band') || text.includes('band')) {
      return 'all_band';
    }
    if (text.includes('everyone') || text.includes('all')) {
      return 'everyone';
    }
    
    // For specific names, return as-is for now
    return assignmentText.trim();
  }
}

module.exports = NaturalLanguageEventCreator;
