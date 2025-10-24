const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');

class EventManager {
  constructor(dataDir) {
    this.dataDir = dataDir || path.join(__dirname, '..', '..', 'data');
    this.eventsFile = path.join(this.dataDir, 'calendar_events.csv');
    this.membersFile = path.join(this.dataDir, 'tour_members.csv');
  }

  async getAllEvents(filters = {}) {
    try {
      const fileContent = await fs.readFile(this.eventsFile, 'utf-8');
      
      // Parse CSV and return a promise that resolves with the data
      const events = await new Promise((resolve, reject) => {
        const results = [];
        const parser = parse(fileContent, {
          columns: true,
          skip_empty_lines: true
        });
        
        parser.on('data', (row) => {
          results.push(row);
        });
        
        parser.on('end', () => {
          resolve(results);
        });
        
        parser.on('error', (error) => {
          reject(error);
        });
      });

      // Apply filters
      let filteredEvents = events;
      if (filters.date) {
        filteredEvents = filteredEvents.filter(e => e.date === filters.date);
      }
      if (filters.member_id) {
        filteredEvents = filteredEvents.filter(e => {
          const members = e.assigned_members ? e.assigned_members.split(',') : [];
          return members.includes(filters.member_id);
        });
      }

      return filteredEvents;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async createEvent(eventData) {
    const events = await this.getAllEvents();
    
    const eventId = `EVT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newEvent = {
      event_id: eventId,
      date: eventData.date || '',
      time: eventData.time || '',
      end_time: eventData.end_time || '',
      description: eventData.description || '',
      location: eventData.location || '',
      show_id: eventData.show_id || '',
      created_by: eventData.created_by || 'tour_manager',
      created_at: new Date().toISOString(),
      notes: eventData.notes || '',
      assigned_members: Array.isArray(eventData.assigned_members) 
        ? eventData.assigned_members.join(',') 
        : (eventData.assigned_members || ''),
      event_type: eventData.event_type || 'general',
      mandatory: eventData.mandatory || 'false'
    };

    events.push(newEvent);
    await this.saveEvents(events);
    
    return newEvent;
  }

  async saveEvents(events) {
    const csvContent = stringify(events, {
      header: true,
      columns: [
        'event_id', 'date', 'time', 'end_time', 'description', 
        'location', 'show_id', 'created_by', 'created_at', 
        'notes', 'assigned_members', 'event_type', 'mandatory'
      ]
    });
    await fs.writeFile(this.eventsFile, csvContent, 'utf-8');
  }

  parseNaturalDate(dateString, referenceDate = new Date()) {
    const input = dateString.toLowerCase().trim();
    
    // Return null for empty input
    if (!input) return null;
    
    const ref = new Date(referenceDate);
    
    // Pattern 1: "today"
    if (input === 'today') {
      return this.formatDate(ref);
    }
    
    // Pattern 2: "tomorrow"
    if (input === 'tomorrow') {
      const tomorrow = new Date(ref);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.formatDate(tomorrow);
    }
    
    // Pattern 3: "in X days"
    const inDaysMatch = input.match(/^(?:in\s+)?(\d+)\s+days?(?:\s+from\s+now)?$/);
    if (inDaysMatch) {
      const daysToAdd = parseInt(inDaysMatch[1], 10);
      const futureDate = new Date(ref);
      futureDate.setDate(futureDate.getDate() + daysToAdd);
      return this.formatDate(futureDate);
    }
    
    // Pattern 4: "next week"
    if (input === 'next week') {
      const nextWeek = new Date(ref);
      const daysUntilMonday = (8 - nextWeek.getDay()) % 7 || 7;
      nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
      return this.formatDate(nextWeek);
    }
    
    // Pattern 5: Day names with modifiers
    const dayNames = {
      'sunday': 0, 'sun': 0,
      'monday': 1, 'mon': 1,
      'tuesday': 2, 'tue': 2, 'tues': 2,
      'wednesday': 3, 'wed': 3,
      'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
      'friday': 5, 'fri': 5,
      'saturday': 6, 'sat': 6
    };
    
    const dayPattern = new RegExp(
      `^(?:(next|this|coming)\\s+)?` +
      `(${Object.keys(dayNames).join('|')})` +
      `(?:\\s+(next\\s+week|this\\s+week))?$`,
      'i'
    );
    
    const dayMatch = input.match(dayPattern);
    if (dayMatch) {
      const modifier = dayMatch[1] || '';
      const dayName = dayMatch[2].toLowerCase();
      const weekModifier = dayMatch[3] || '';
      
      const targetDayOfWeek = dayNames[dayName];
      const currentDayOfWeek = ref.getDay();
      
      return this.calculateDayOfWeekDate(ref, targetDayOfWeek, currentDayOfWeek, modifier, weekModifier);
    }
    
    // No pattern matched
    return null;
  }

  calculateDayOfWeekDate(referenceDate, targetDayOfWeek, currentDayOfWeek, modifier, weekModifier) {
    const result = new Date(referenceDate);
    let daysToAdd = 0;
    
    // Handle "next week" or "this week" explicit modifiers
    if (weekModifier === 'next week') {
      daysToAdd = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
      
    } else if (weekModifier === 'this week') {
      daysToAdd = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
      if (daysToAdd === 0) daysToAdd = 0;
      
    } else if (modifier === 'next' || modifier === 'coming') {
      daysToAdd = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
      if (daysToAdd === 0 || targetDayOfWeek < currentDayOfWeek) {
        daysToAdd += 7;
      }
      
    } else if (modifier === 'this') {
      daysToAdd = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
      if (daysToAdd === 0) {
        daysToAdd = 0;
      }
      
    } else {
      // Plain day name like "monday" or "thursday"
      daysToAdd = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
      if (daysToAdd === 0) {
        daysToAdd = 7;
      }
    }
    
    result.setDate(result.getDate() + daysToAdd);
    return this.formatDate(result);
  }
  parseNaturalTime(timeString) {
    const lower = timeString.toLowerCase().trim();
    
    const ampmMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1]);
      const minutes = ampmMatch[2] || '00';
      const meridiem = ampmMatch[3];
      
      if (meridiem === 'pm' && hours !== 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      
      return `${String(hours).padStart(2, '0')}:${minutes}`;
    }
    
    return null;
  }

  async updateEvent(eventId, updates) {
    const events = await this.getAllEvents();
    const eventIndex = events.findIndex(e => e.event_id === eventId);
    
    if (eventIndex === -1) {
      throw new Error(`Event ${eventId} not found`);
    }
    
    if (updates.assigned_members && Array.isArray(updates.assigned_members)) {
      updates.assigned_members = updates.assigned_members.join(",");
    }
    
    events[eventIndex] = { ...events[eventIndex], ...updates };
    await this.saveEvents(events);
    
    return events[eventIndex];
  }

  async deleteEvent(eventId) {
    const events = await this.getAllEvents();
    const filteredEvents = events.filter(e => e.event_id !== eventId);
    
    if (events.length === filteredEvents.length) {
      throw new Error(`Event ${eventId} not found`);
    }
    
    await this.saveEvents(filteredEvents);
    return true;
  }

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

module.exports = EventManager;
