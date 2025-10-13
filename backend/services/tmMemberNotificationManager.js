// backend/services/tmMemberNotificationManager.js
// Manages notification settings for all touring party members (crew & band)

const pool = require('../db/pool');
const crypto = require('crypto');
const csvDataSource = require('./csvDataSource');

class TmMemberNotificationManager {
  constructor() {
    this.pool = pool;
    
    // Define notification types by member type
    this.notificationTypes = {
      crew: [
        'notify_on_schedule_change',
        'notify_on_traffic_delay', 
        'notify_on_lobby_change',
        'notify_on_soundcheck_change',
        'notify_on_emergency'
      ],
      band: [
        'notify_on_schedule_change',
        'notify_on_traffic_delay',
        'notify_on_lobby_change', 
        'notify_on_set_time_change',
        'notify_on_meet_greet',
        'notify_on_press_commitments',
        'notify_on_travel_departure',
        'notify_on_emergency'
      ]
    };
  }

  // Add band member manually
  async addBandMember(showId, memberData) {
    try {
      const notificationId = '#' + crypto.randomBytes(3).toString('hex').toUpperCase();
      
      const result = await this.pool.query(
        `INSERT INTO tm_member_notifications 
         (notification_id, show_id, name, phone, email, role, member_type,
          notify_on_set_time_change, notify_on_emergency)
         VALUES ($1, $2, $3, $4, $5, $6, 'band', true, true)
         RETURNING *`,
        [
          notificationId,
          showId,
          memberData.name,
          memberData.phone,
          memberData.email,
          memberData.role || 'Band Member'
        ]
      );
      
      return result.rows[0];
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error adding band member:', err);
      throw err;
    }
  }

  // Get all members (crew + band) for a show
  async getAllMemberNotificationSettings(showId, memberType = null) {
    try {
      let query = 'SELECT * FROM tm_member_notifications WHERE show_id = $1';
      const params = [showId];
      
      if (memberType) {
        query += ' AND member_type = $2';
        params.push(memberType);
      }
      
      query += ' ORDER BY member_type, role, name';
      
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error getting member settings:', err);
      throw err;
    }
  }

  // Toggle notification for specific member
  async toggleMemberNotification(notificationId, notificationType) {
    try {
      // Get member type to validate notification type
      const memberResult = await this.pool.query(
        'SELECT member_type FROM tm_member_notifications WHERE notification_id = $1',
        [notificationId]
      );

      if (memberResult.rows.length === 0) {
        return { error: 'Member not found' };
      }

      const memberType = memberResult.rows[0].member_type;
      const validTypes = this.notificationTypes[memberType] || this.notificationTypes.crew;

      if (!validTypes.includes(notificationType)) {
        return { error: `Invalid notification type for ${memberType} member` };
      }

      // Get current value
      const current = await this.pool.query(
        `SELECT ${notificationType}, name, role FROM tm_member_notifications WHERE notification_id = $1`,
        [notificationId]
      );

      const currentValue = current.rows[0][notificationType];
      const newValue = !currentValue;

      // Update
      const result = await this.pool.query(
        `UPDATE tm_member_notifications 
         SET ${notificationType} = $1, updated_at = CURRENT_TIMESTAMP
         WHERE notification_id = $2
         RETURNING *`,
        [newValue, notificationId]
      );

      return {
        success: true,
        member: current.rows[0].name,
        role: current.rows[0].role,
        setting: notificationType,
        previousValue: currentValue,
        newValue: newValue
      };
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error toggling notification:', err);
      throw err;
    }
  }

  // Bulk toggle for specific member type
  async bulkToggleByType(showId, memberType, notificationType, enabled) {
    try {
      const validTypes = this.notificationTypes[memberType];
      if (!validTypes || !validTypes.includes(notificationType)) {
        return { error: `Invalid notification type for ${memberType}` };
      }

      const result = await this.pool.query(
        `UPDATE tm_member_notifications 
         SET ${notificationType} = $1, updated_at = CURRENT_TIMESTAMP
         WHERE show_id = $2 AND member_type = $3
         RETURNING name, role`,
        [enabled, showId, memberType]
      );

      return {
        success: true,
        affected: result.rows.length,
        memberType: memberType,
        setting: notificationType,
        newValue: enabled,
        members: result.rows
      };
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error bulk toggling by type:', err);
      throw err;
    }
  }

  // Get members to notify for specific event
  async getMembersToNotifyForEvent(showId, eventType, memberTypeFilter = null) {
    try {
      const notificationField = {
        'schedule_change': 'notify_on_schedule_change',
        'traffic_delay': 'notify_on_traffic_delay',
        'lobby_change': 'notify_on_lobby_change',
        'soundcheck_change': 'notify_on_soundcheck_change',
        'set_time_change': 'notify_on_set_time_change',
        'meet_greet': 'notify_on_meet_greet',
        'press_commitments': 'notify_on_press_commitments',
        'travel_departure': 'notify_on_travel_departure',
        'emergency': 'notify_on_emergency'
      }[eventType];

      if (!notificationField) {
        return [];
      }

      let query = `SELECT * FROM tm_member_notifications 
                   WHERE show_id = $1 AND ${notificationField} = true 
                   AND (phone IS NOT NULL OR email IS NOT NULL)`;
      const params = [showId];

      if (memberTypeFilter) {
        query += ' AND member_type = $2';
        params.push(memberTypeFilter);
      }

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error getting members for event:', err);
      return [];
    }
  }

  // Quick presets for common scenarios
  async applyPreset(showId, preset) {
    try {
      const presets = {
        'all_essential': {
          description: 'Enable essential notifications for everyone',
          settings: {
            all: {
              notify_on_schedule_change: true,
              notify_on_traffic_delay: true,
              notify_on_emergency: true
            }
          }
        },
        'band_performance': {
          description: 'Enable performance notifications for band only',
          settings: {
            band: {
              notify_on_set_time_change: true,
              notify_on_lobby_change: true,
              notify_on_soundcheck_change: true
            }
          }
        },
        'crew_logistics': {
          description: 'Enable logistics notifications for crew only',
          settings: {
            crew: {
              notify_on_traffic_delay: true,
              notify_on_lobby_change: true,
              notify_on_schedule_change: true
            }
          }
        }
      };

      const presetConfig = presets[preset];
      if (!presetConfig) {
        return { error: 'Invalid preset' };
      }

      let totalAffected = 0;

      for (const [memberType, settings] of Object.entries(presetConfig.settings)) {
        for (const [setting, value] of Object.entries(settings)) {
          const whereClause = memberType === 'all' 
            ? 'WHERE show_id = $2' 
            : 'WHERE show_id = $2 AND member_type = $3';
          
          const params = memberType === 'all' 
            ? [value, showId]
            : [value, showId, memberType];

          const result = await this.pool.query(
            `UPDATE tm_member_notifications 
             SET ${setting} = $1, updated_at = CURRENT_TIMESTAMP
             ${whereClause}`,
            params
          );

          totalAffected += result.rowCount;
        }
      }

      return {
        success: true,
        preset: preset,
        description: presetConfig.description,
        affected: totalAffected
      };
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error applying preset:', err);
      throw err;
    }
  }
}

module.exports = new TmMemberNotificationManager();

  // Search for member by name or role
  async findMember(showId, searchTerm) {
    try {
      const searchLower = searchTerm.toLowerCase();
      
      const result = await this.pool.query(
        `SELECT * FROM tm_member_notifications 
         WHERE show_id = $1 
         AND (LOWER(name) LIKE $2 OR LOWER(role) LIKE $2)
         ORDER BY 
           CASE 
             WHEN LOWER(name) = $3 THEN 0
             WHEN LOWER(role) = $3 THEN 1
             ELSE 2
           END
         LIMIT 5`,
        [showId, `%${searchLower}%`, searchLower]
      );
      
      return result.rows;
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error finding member:', err);
      return [];
    }
  }

  // Update individual member settings
  async updateIndividualMember(notificationId, settings) {
    try {
      // Build update query dynamically
      const updateFields = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(settings)) {
        if (key.startsWith('notify_on_') && typeof value === 'boolean') {
          updateFields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }

      if (updateFields.length === 0) {
        return { error: 'No valid notification settings to update' };
      }

      values.push(notificationId);
      
      const result = await this.pool.query(
        `UPDATE tm_member_notifications 
         SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE notification_id = $${paramCount}
         RETURNING *`,
        values
      );

      return result.rows[0];
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error updating individual:', err);
      throw err;
    }
  }

  // Get notification summary for a member
  async getMemberNotificationSummary(notificationId) {
    try {
      const result = await this.pool.query(
        `SELECT name, role, member_type,
                notify_on_schedule_change, notify_on_traffic_delay,
                notify_on_lobby_change, notify_on_soundcheck_change,
                notify_on_set_time_change, notify_on_meet_greet,
                notify_on_press_commitments, notify_on_travel_departure,
                notify_on_emergency
         FROM tm_member_notifications 
         WHERE notification_id = $1`,
        [notificationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const member = result.rows[0];
      const enabledNotifications = [];
      
      Object.keys(member).forEach(key => {
        if (key.startsWith('notify_on_') && member[key] === true) {
          enabledNotifications.push(key.replace('notify_on_', '').replace(/_/g, ' '));
        }
      });

      return {
        ...member,
        enabledNotifications,
        totalEnabled: enabledNotifications.length
      };
    } catch (err) {
      console.error('[MEMBER-NOTIFY] Error getting summary:', err);
      return null;
    }
  }
