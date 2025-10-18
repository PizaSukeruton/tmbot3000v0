// backend/services/tmSettingsManager.js
// Manages Tour Manager settings for automated adjustments and notifications

const pool = require('../db/pool');
const crypto = require('crypto');

class TmSettingsManager {
  constructor() {
    this.pool = pool;
  }

  // Get or create default settings for a TM
  async getSettings(userId, showId) {
    try {
      // Check if settings exist
      const result = await this.pool.query(
        'SELECT * FROM tm_settings WHERE user_id = $1 AND show_id = $2',
        [userId, showId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Create default settings if none exist
      const settingId = '#' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const insertResult = await this.pool.query(
        `INSERT INTO tm_settings (setting_id, user_id, show_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [settingId, userId, showId]
      );

      return insertResult.rows[0];
    } catch (err) {
      console.error('[SETTINGS] Error getting settings:', err);
      throw err;
    }
  }

  // Update specific settings
  async updateSettings(userId, showId, updates) {
    try {
      const allowedFields = [
        'traffic_monitoring_enabled',
        'traffic_check_hours_before',
        'traffic_delay_threshold_minutes',
        'auto_adjust_enabled',
        'auto_adjust_requires_approval',
        'adjustment_buffer_minutes',
        'auto_notify_on_adjustment',
        'notify_all_crew',
        'notify_local_drivers',
        'notify_department_heads',
        'adjustment_sms_template'
      ];

      // Build dynamic update query
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }

      if (updateFields.length === 0) {
        return { error: 'No valid fields to update' };
      }

      values.push(userId, showId);
      const query = `
        UPDATE tm_settings 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $${paramCount} AND show_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await this.pool.query(query, values);
      return result.rows[0] || { error: 'Settings not found' };
    } catch (err) {
      console.error('[SETTINGS] Error updating settings:', err);
      throw err;
    }
  }

  // Add crew notification preferences
  async addCrewNotificationPref(data) {
    try {
      const prefId = '#' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const result = await this.pool.query(
        `INSERT INTO tm_crew_notification_prefs 
         (pref_id, phone_number, crew_name, department, is_local_driver, 
          is_department_head, opt_in_auto_notifications, show_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          prefId,
          data.phone_number,
          data.crew_name,
          data.department,
          data.is_local_driver || false,
          data.is_department_head || false,
          data.opt_in_auto_notifications !== false,
          data.show_id
        ]
      );
      
      return result.rows[0];
    } catch (err) {
      console.error('[SETTINGS] Error adding crew notification pref:', err);
      throw err;
    }
  }

  // Get crew to notify based on settings
  async getCrewToNotify(showId, settings) {
    try {
      let whereConditions = ['show_id = $1', 'opt_in_auto_notifications = true'];
      const values = [showId];

      // Build conditions based on settings
      if (!settings.notify_all_crew) {
        const orConditions = [];
        
        if (settings.notify_local_drivers) {
          orConditions.push('is_local_driver = true');
        }
        
        if (settings.notify_department_heads) {
          orConditions.push('is_department_head = true');
        }
        
        if (orConditions.length > 0) {
          whereConditions.push(`(${orConditions.join(' OR ')})`);
        }
      }

      const query = `
        SELECT * FROM tm_crew_notification_prefs
        WHERE ${whereConditions.join(' AND ')}
      `;

      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (err) {
      console.error('[SETTINGS] Error getting crew to notify:', err);
      return [];
    }
  }
}

module.exports = new TmSettingsManager();
