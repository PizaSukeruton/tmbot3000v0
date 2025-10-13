#!/bin/bash

# Add method to search for individual members by name or role
cat >> backend/services/tmMemberNotificationManager.js << 'EOL'

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
EOL

echo "✅ Added individual member search methods"
