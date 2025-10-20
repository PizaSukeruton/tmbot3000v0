const EventManager = require('./eventManager');

class EventConversation {
  constructor(eventManager) {
    this.eventManager = eventManager || new EventManager();
    this.states = {};
  }

  getState(sessionId) {
    if (!this.states[sessionId]) {
      this.states[sessionId] = {
        step: 'description',
        data: {},
        lastUpdated: Date.now()
      };
    }
    return this.states[sessionId];
  }

  clearState(sessionId) {
    delete this.states[sessionId];
  }

  async handleMessage(sessionId, message, userId) {
    const state = this.getState(sessionId);
    const step = state.step;
    
    if (message.toLowerCase().includes('cancel') || message.toLowerCase().includes('stop')) {
      this.clearState(sessionId);
      return {
        message: 'Event creation cancelled.',
        complete: true
      };
    }

    switch (step) {
      case 'description':
        return await this.handleDescription(sessionId, message, userId);
      case 'date':
        return await this.handleDate(sessionId, message);
      case 'time':
        return await this.handleTime(sessionId, message);
      case 'location':
        return await this.handleLocation(sessionId, message);
      case 'confirm':
        return await this.handleConfirmation(sessionId, message);
      default:
        return {
          message: 'Something went wrong. Please type "create event" to start over.',
          complete: true
        };
    }
  }

  async handleDescription(sessionId, message, userId) {
    const state = this.getState(sessionId);
    state.data.description = message;
    state.data.created_by = userId;
    state.step = 'date';
    
    return {
      message: 'What date is this event? (e.g., "tomorrow", "today")',
      complete: false
    };
  }

  async handleDate(sessionId, message) {
    const state = this.getState(sessionId);
    const parsedDate = this.eventManager.parseNaturalDate(message);
    
    if (!parsedDate) {
      return {
        message: 'I couldn\'t understand that date. Please try "today" or "tomorrow"',
        complete: false
      };
    }
    
    state.data.date = parsedDate;
    state.step = 'time';
    
    return {
      message: 'What time does it start? (e.g., "2pm", "14:00")',
      complete: false
    };
  }

  async handleTime(sessionId, message) {
    const state = this.getState(sessionId);
    const parsedTime = this.eventManager.parseNaturalTime(message);
    
    if (!parsedTime) {
      return {
        message: 'I couldn\'t understand that time. Please try "2pm" or "14:00"',
        complete: false
      };
    }
    
    state.data.time = parsedTime;
    state.step = 'location';
    
    return {
      message: 'Where is this event?',
      complete: false
    };
  }

  async handleLocation(sessionId, message) {
    const state = this.getState(sessionId);
    state.data.location = message;
    state.step = 'confirm';
    
    const summary = this.generateSummary(state.data);
    
    return {
      message: `Here's the event summary:\n\n${summary}\n\nType "confirm" to create this event, or "cancel" to abort.`,
      complete: false
    };
  }

  async handleConfirmation(sessionId, message) {
    const state = this.getState(sessionId);
    
    if (message.toLowerCase().includes('confirm') || message.toLowerCase().includes('yes')) {
      try {
        const event = await this.eventManager.createEvent(state.data);
        this.clearState(sessionId);
        
        return {
          message: `Event created successfully! Event ID: ${event.event_id}`,
          complete: true,
          event: event
        };
      } catch (error) {
        this.clearState(sessionId);
        return {
          message: `Error creating event: ${error.message}`,
          complete: true,
          error: error
        };
      }
    } else {
      this.clearState(sessionId);
      return {
        message: 'Event creation cancelled.',
        complete: true
      };
    }
  }

  generateSummary(eventData) {
    const lines = [
      `Date: ${eventData.date}`,
      `Time: ${eventData.time}`,
      `Location: ${eventData.location}`,
      `Description: ${eventData.description}`
    ];
    
    return lines.join('\n');
  }
}

module.exports = EventConversation;
