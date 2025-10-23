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
    const lower = dateString.toLowerCase().trim();
    
    if (lower === 'today') {
      const today = new Date();
      return this.formatDate(today);
    }
    
    if (lower === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.formatDate(tomorrow);
    }
    
    return null;
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
