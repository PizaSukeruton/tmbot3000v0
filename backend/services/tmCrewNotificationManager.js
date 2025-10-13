// backend/services/tmCrewNotificationManager.js
// Manages individual crew notification settings

const pool = require('../db/pool');
const crypto = require('crypto');
const csvDataSource = require('./csvDataSource');

class TmCrewNotificationManager {
  constructor() {
    this.pool = pool;
  }

  // Import crew from production_notes.csv
  async importCrewFromProduction(showId) {
    try {
      const ds = csvDataSource.createCsvDataSource({ dataDir: './data' });
      const prodNotes = await ds.getProductionNotes(showId);
      
      const crewMembers = [];
      
      for (const note of prodNotes) {
        if (note.category === 'crew' && note.note) {
          // Parse crew info from note format: "Role: Name - contact: phone/email"
          const match = note.note.match(/^(.+?):\s*(.+?)\s*-\s*contact\s*(.+)$/i);
          
          if (match) {
            const [_, role, name, contact] = match;
            const notificationId = '#' + crypto.randomBytes(3).toString('hex').toUpperCase();
            
            // Try to extract phone from contact
            const phoneMatch = contact.match(/(\+?\d[\d\s-]+)/);
            const phone = phoneMatch ? phoneMatch[1].replace(/\s|-/g, '') : null;
            
            await this.pool.query(
              `INSERT INTO tm_crew_notifications 
               (notification_id, show_id, name, phone, role)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT DO NOTHING`,
              [notificationId, showId, name.trim(), phone, role.trim()]
            );
            
            crewMembers.push({ name: name.trim(), role: role.trim(), phone });
          }
        }
      }
      
      return { imported: crewMembers.length, members: crewMembers };
    } catch (err) {
      console.error('[CREW-NOTIFY] Error importing crew:', err);
      throw err;
    }
  }

  // Get all crew for a show
  async getCrewNotificationSettings(showId) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM tm_crew_notifications WHERE show_id = $1 ORDER BY role, name',
        [showId]
      );
      return result.rows;
    } catch (err) {
      console.error('[CREW-NOTIFY] Error getting crew settings:', err);
      throw err;
    }
  }

  // Toggle notification for specific crew member
  async toggleCrewNotification(notificationId, notificationType) {
    try {
      const validTypes = [
        'notify_on_schedule_change',
        'notify_on_traffic_delay',
        'notify_on_lobby_change',
        'notify_on_soundcheck_change',
        'notify_on_emergency'
      ];

      if (!validTypes.includes(notificationType)) {
        return { error: 'Invalid notification type' };
      }

      // Get current value
      const current = await this.pool.query(
        `SELECT ${notificationType} FROM tm_crew_notifications WHERE notification_id = $1`,
        [notificationId]
      );

      if (current.rows.length === 0) {
        return { error: 'Crew member not found' };
      }

      const currentValue = current.rows[0][notificationType];
      const newValue = !currentValue;

      // Update
      const result = await this.pool.query(
        `UPDATE tm_crew_notifications 
         SET ${notificationType} = $1, updated_at = CURRENT_TIMESTAMP
         WHERE notification_id = $2
         RETURNING *`,
        [newValue, notificationId]
      );

      return {
        success: true,
        member: result.rows[0].name,
        setting: notificationType,
        previousValue: currentValue,
        newValue: newValue
      };
    } catch (err) {
      console.error('[CREW-NOTIFY] Error toggling notification:', err);
      throw err;
    }
  }

  // Bulk toggle - turn on/off for all crew
  async bulkToggleNotifications(showId, notificationType, enabled) {
    try {
      const result = await this.pool.query(
        `UPDATE tm_crew_notifications 
         SET ${notificationType} = $1, updated_at = CURRENT_TIMESTAMP
         WHERE show_id = $2
         RETURNING name`,
        [enabled, showId]
      );

      return {
        success: true,
        affected: result.rows.length,
        setting: notificationType,
        newValue: enabled
      };
    } catch (err) {
      console.error('[CREW-NOTIFY] Error bulk toggling:', err);
      throw err;
    }
  }

  // Get crew to notify for specific event type
  async getCrewToNotifyForEvent(showId, eventType) {
    try {
      const notificationField = {
        'schedule_change': 'notify_on_schedule_change',
        'traffic_delay': 'notify_on_traffic_delay',
        'lobby_change': 'notify_on_lobby_change',
        'soundcheck_change': 'notify_on_soundcheck_change',
        'emergency': 'notify_on_emergency'
      }[eventType];

      if (!notificationField) {
        return [];
      }

      const result = await this.pool.query(
        `SELECT * FROM tm_crew_notifications 
         WHERE show_id = $1 AND ${notificationField} = true AND phone IS NOT NULL`,
        [showId]
      );

      return result.rows;
    } catch (err) {
      console.error('[CREW-NOTIFY] Error getting crew for event:', err);
      return [];
    }
  }
}

module.exports = new TmCrewNotificationManager();
