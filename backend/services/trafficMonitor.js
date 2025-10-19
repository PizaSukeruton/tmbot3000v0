const db = require('../db/database');
const tmMapsService = require('./tmMapsService');

class TrafficMonitor {
  constructor() {
    this.isRunning = false;
    this.checkInterval = null;
    this.systemSettings = new Map();
  }

  async initialize() {
    await this.loadSystemSettings();
    console.log('[TRAFFIC-MONITOR] Initialized');
  }

  async loadSystemSettings() {
    try {
      const result = await db.query('SELECT setting_name, setting_value FROM system_settings WHERE category = $1 AND is_enabled = true', ['traffic']);
      
      for (const row of result.rows) {
        this.systemSettings.set(row.setting_name, row.setting_value);
      }
      
      console.log(`[TRAFFIC-MONITOR] Loaded ${result.rows.length} system settings`);
    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Failed to load system settings:', error);
    }
  }

  async startMonitoring() {
    if (this.isRunning) {
      console.log('[TRAFFIC-MONITOR] Already running');
      return;
    }

    const checkFrequency = parseInt(this.systemSettings.get('traffic_check_frequency_minutes') || '30');
    const intervalMs = checkFrequency * 60 * 1000;

    console.log(`[TRAFFIC-MONITOR] Starting monitoring - checking every ${checkFrequency} minutes`);
    
    this.isRunning = true;
    await this.performTrafficCheck();
    
    this.checkInterval = setInterval(async () => {
      await this.performTrafficCheck();
    }, intervalMs);
  }

  async stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[TRAFFIC-MONITOR] Stopped monitoring');
  }

  async performTrafficCheck() {
    try {
      const activeRoutes = await this.getActiveRoutes();
      console.log(`[TRAFFIC-MONITOR] Checking ${activeRoutes.length} active routes`);

      for (const route of activeRoutes) {
        await this.checkRouteTraffic(route);
      }
    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Error during traffic check:', error);
    }
  }

  async getActiveRoutes() {
    const now = new Date();
    
    const result = await db.query(`
      SELECT * FROM travel_routes 
      WHERE is_active = true 
      AND alert_workflow_state IN ('monitoring', 'threshold_exceeded', 'tour_manager_notified', 'awaiting_decision')
      AND monitoring_start_time <= $1 
      AND monitoring_end_time > $1
      ORDER BY event_time_local ASC
    `, [now]);

    return result.rows;
  }

  async checkRouteTraffic(route) {
    try {
      const currentTravelTime = await tmMapsService.getTravelTime(
        route.origin_address,
        route.destination_address
      );

      if (!currentTravelTime || currentTravelTime.status !== 'OK') {
        console.error(`[TRAFFIC-MONITOR] Failed to get travel time for route ${route.route_id}`);
        return;
      }

      const currentMinutes = Math.ceil(currentTravelTime.duration.value / 60);
      const delayMinutes = currentMinutes - route.baseline_minutes;
      const delayPercentage = ((currentMinutes - route.baseline_minutes) / route.baseline_minutes) * 100;
      const thresholdExceeded = delayPercentage >= route.alert_threshold_percentage;

      await this.logTrafficCheck(route, currentMinutes, delayMinutes, delayPercentage, thresholdExceeded, currentTravelTime);

      if (thresholdExceeded && route.alert_workflow_state === 'monitoring') {
        await this.handleThresholdExceeded(route, currentMinutes, delayPercentage);
      }

      console.log(`[TRAFFIC-MONITOR] Route ${route.route_id}: ${currentMinutes}min (baseline: ${route.baseline_minutes}min, +${delayPercentage.toFixed(1)}%)`);

    } catch (error) {
      console.error(`[TRAFFIC-MONITOR] Error checking route ${route.route_id}:`, error);
    }
  }

  async logTrafficCheck(route, currentMinutes, delayMinutes, delayPercentage, thresholdExceeded, mapsResponse) {
    try {
      await db.query(`
        INSERT INTO traffic_alerts (
          route_id, member_id, show_id, origin_address, destination_address,
          baseline_minutes, current_minutes, delay_minutes, delay_percentage,
          threshold_percentage, threshold_exceeded, maps_api_response
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        route.route_id,
        route.member_id,
        route.show_id,
        route.origin_address,
        route.destination_address,
        route.baseline_minutes,
        currentMinutes,
        delayMinutes,
        delayPercentage,
        route.alert_threshold_percentage,
        thresholdExceeded,
        JSON.stringify(mapsResponse)
      ]);
    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Failed to log traffic check:', error);
    }
  }

  async handleThresholdExceeded(route, currentMinutes, delayPercentage) {
    try {
      await db.query(`
        UPDATE travel_routes 
        SET alert_workflow_state = 'threshold_exceeded'
        WHERE route_id = $1
      `, [route.route_id]);

      if (route.system_mode === 'basic') {
        await this.notifyTourManagerOnly(route, currentMinutes, delayPercentage);
      } else if (route.system_mode === 'expanded') {
        await this.initiateExpandedWorkflow(route, currentMinutes, delayPercentage);
      }

      console.log(`[TRAFFIC-MONITOR] Threshold exceeded for route ${route.route_id} - ${route.system_mode} mode triggered`);

    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Failed to handle threshold exceeded:', error);
    }
  }

  async notifyTourManagerOnly(route, currentMinutes, delayPercentage) {
    try {
      const messageTemplate = this.systemSettings.get('default_traffic_alert_template') || 
        'Traffic to {destination} is now {current_minutes} minutes (normally {baseline_minutes})';
      
      const message = messageTemplate
        .replace('{destination}', route.destination_address)
        .replace('{current_minutes}', currentMinutes)
        .replace('{baseline_minutes}', route.baseline_minutes);

      await db.query(`
        UPDATE travel_routes 
        SET 
          alert_workflow_state = 'tour_manager_notified',
          tour_manager_notified_at = NOW()
        WHERE route_id = $1
      `, [route.route_id]);

      console.log(`[TRAFFIC-MONITOR] Tour manager notified for route ${route.route_id}: ${message}`);

    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Failed to notify tour manager:', error);
    }
  }

  async initiateExpandedWorkflow(route, currentMinutes, delayPercentage) {
    try {
      await db.query(`
        UPDATE travel_routes 
        SET 
          alert_workflow_state = 'awaiting_decision',
          tour_manager_notified_at = NOW()
        WHERE route_id = $1
      `, [route.route_id]);

      console.log(`[TRAFFIC-MONITOR] Expanded workflow initiated for route ${route.route_id} - awaiting tour manager decision`);

    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Failed to initiate expanded workflow:', error);
    }
  }

  async processTimeouts() {
    try {
      const timeoutMinutes = parseInt(this.systemSettings.get('tour_manager_decision_timeout_minutes') || '15');
      const timeoutThreshold = new Date(Date.now() - (timeoutMinutes * 60 * 1000));

      const timedOutRoutes = await db.query(`
        SELECT * FROM travel_routes 
        WHERE alert_workflow_state = 'awaiting_decision'
        AND tour_manager_notified_at < $1
        AND is_active = true
      `, [timeoutThreshold]);

      for (const route of timedOutRoutes.rows) {
        await this.handleDecisionTimeout(route);
      }

      if (timedOutRoutes.rows.length > 0) {
        console.log(`[TRAFFIC-MONITOR] Processed ${timedOutRoutes.rows.length} timed-out decisions`);
      }

    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Error processing timeouts:', error);
    }
  }

  async handleDecisionTimeout(route) {
    const escalationEnabled = this.systemSettings.get('traffic_alert_escalation_enabled') === 'true';
    
    if (escalationEnabled) {
      await db.query(`
        UPDATE travel_routes 
        SET 
          alert_workflow_state = 'members_notified',
          tour_manager_decision = 'auto_escalated',
          tour_manager_decision_at = NOW()
        WHERE route_id = $1
      `, [route.route_id]);

      console.log(`[TRAFFIC-MONITOR] Auto-escalated route ${route.route_id} due to timeout`);
    } else {
      await db.query(`
        UPDATE travel_routes 
        SET 
          alert_workflow_state = 'ignored',
          tour_manager_decision = 'timeout_ignored',
          tour_manager_decision_at = NOW()
        WHERE route_id = $1
      `, [route.route_id]);

      console.log(`[TRAFFIC-MONITOR] Marked route ${route.route_id} as ignored due to timeout`);
    }
  }

  async cleanupCompletedRoutes() {
    try {
      const cleanupDays = parseInt(this.systemSettings.get('reminder_cleanup_days') || '30');
      const cleanupThreshold = new Date(Date.now() - (cleanupDays * 24 * 60 * 60 * 1000));

      const result = await db.query(`
        UPDATE travel_routes 
        SET is_active = false 
        WHERE event_time_local < $1 
        AND alert_workflow_state IN ('completed', 'ignored')
        AND is_active = true
        RETURNING route_id
      `, [cleanupThreshold]);

      if (result.rows.length > 0) {
        console.log(`[TRAFFIC-MONITOR] Cleaned up ${result.rows.length} completed routes older than ${cleanupDays} days`);
      }

    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Error during cleanup:', error);
    }
  }

  async getRouteStatus(routeId) {
    try {
      const result = await db.query('SELECT * FROM travel_routes WHERE route_id = $1', [routeId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Error getting route status:', error);
      return null;
    }
  }

  async updateRouteDecision(routeId, decision, tourManagerId) {
    try {
      let newState;
      switch (decision) {
        case 'notify_all':
          newState = 'members_notified';
          break;
        case 'notify_crew':
          newState = 'members_notified';
          break;
        case 'notify_band':
          newState = 'members_notified';
          break;
        case 'ignore':
          newState = 'ignored';
          break;
        default:
          throw new Error(`Unknown decision: ${decision}`);
      }

      await db.query(`
        UPDATE travel_routes 
        SET 
          alert_workflow_state = $1,
          tour_manager_decision = $2,
          tour_manager_decision_at = NOW(),
          tour_manager_id = $3
        WHERE route_id = $4
      `, [newState, decision, tourManagerId, routeId]);

      console.log(`[TRAFFIC-MONITOR] Updated route ${routeId} decision: ${decision} -> ${newState}`);
      return true;

    } catch (error) {
      console.error('[TRAFFIC-MONITOR] Error updating route decision:', error);
      return false;
    }
  }
}

const trafficMonitor = new TrafficMonitor();

module.exports = trafficMonitor;
