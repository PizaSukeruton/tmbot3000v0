// backend/services/tmScheduleAdjuster.js
// Handles automated schedule adjustments based on traffic delays

const settingsManager = require('./tmSettingsManager');
const smsService = require('./tmSmsService');
const mapsService = require('./tmMapsService');

class TmScheduleAdjuster {
  constructor() {
    this.pendingAdjustments = new Map(); // Store adjustments awaiting approval
  }

  // Calculate adjusted times based on delay
  calculateAdjustedTimes(originalTimes, delayMinutes, bufferMinutes = 15) {
    const totalAdjustment = delayMinutes + bufferMinutes;
    const adjustments = {};

    // Parse and adjust times
    for (const [event, time] of Object.entries(originalTimes)) {
      if (time) {
        const [hours, minutes] = time.split(':').map(Number);
        const originalMinutes = hours * 60 + minutes;
        const adjustedMinutes = originalMinutes - totalAdjustment;
        
        const newHours = Math.floor(adjustedMinutes / 60);
        const newMinutes = adjustedMinutes % 60;
        
        adjustments[event] = {
          original: time,
          adjusted: `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`,
          adjustment: totalAdjustment
        };
      }
    }

    return adjustments;
  }

  // Process traffic delay and suggest adjustments
  async processTrafficDelay(showId, userId, trafficDelay) {
    try {
      // Get TM settings
      const settings = await settingsManager.getSettings(userId, showId);
      
      if (!settings.auto_adjust_enabled) {
        console.log('[ADJUSTER] Auto-adjust disabled for this show');
        return null;
      }

      // Check if delay exceeds threshold
      if (trafficDelay.delayMinutes < settings.traffic_delay_threshold_minutes) {
        console.log('[ADJUSTER] Delay below threshold, no adjustment needed');
        return null;
      }

      // Get show times from data source
      const dataSource = require('./csvDataSource');
      const ds = dataSource.createCsvDataSource({ dataDir: './data' });
      const show = await ds.getShow(showId);
      
      if (!show) {
        console.error('[ADJUSTER] Show not found:', showId);
        return null;
      }

      // Calculate adjusted times
      const originalTimes = {
        'Lobby Call': show.lobby_call,
        'Hotel Departure': show.hotel_departure,
        'Load In': show.load_in,
        'Soundcheck': show.soundcheck_time
      };

      const adjustments = this.calculateAdjustedTimes(
        originalTimes,
        trafficDelay.delayMinutes,
        settings.adjustment_buffer_minutes
      );

      // Create adjustment record
      const adjustmentId = Date.now().toString();
      const adjustment = {
        id: adjustmentId,
        showId,
        userId,
        trafficDelay,
        adjustments,
        status: settings.auto_adjust_requires_approval ? 'pending_approval' : 'approved',
        createdAt: new Date()
      };

      if (settings.auto_adjust_requires_approval) {
        // Store for approval
        this.pendingAdjustments.set(adjustmentId, adjustment);
        
        // Notify TM for approval
        await this.notifyTMForApproval(userId, adjustment);
      } else {
        // Auto-approve and notify
        await this.executeAdjustment(adjustment, settings);
      }

      return adjustment;
    } catch (err) {
      console.error('[ADJUSTER] Error processing traffic delay:', err);
      return null;
    }
  }

  // Execute approved adjustment
  async executeAdjustment(adjustment, settings = null) {
    try {
      if (!settings) {
        settings = await settingsManager.getSettings(
          adjustment.userId,
          adjustment.showId
        );
      }

      if (!settings.auto_notify_on_adjustment) {
        console.log('[ADJUSTER] Auto-notify disabled');
        return { success: true, notificationsSent: 0 };
      }

      // Get crew to notify
      const crewToNotify = await settingsManager.getCrewToNotify(
        adjustment.showId,
        settings
      );

      console.log(`[ADJUSTER] Notifying ${crewToNotify.length} crew members`);

      // Send notifications
      let notificationsSent = 0;
      for (const crew of crewToNotify) {
        // Build message from template
        const lobbyAdjustment = adjustment.adjustments['Lobby Call'];
        const message = settings.adjustment_sms_template
          .replace('{{event}}', 'Lobby Call')
          .replace('{{new_time}}', lobbyAdjustment.adjusted)
          .replace('{{old_time}}', lobbyAdjustment.original)
          .replace('{{reason}}', `${adjustment.trafficDelay.delayMinutes} min traffic delay`)
          .replace('{{additional_info}}', 'Please acknowledge receipt.');

        try {
          await smsService.sendSMS(crew.phone_number, message);
          notificationsSent++;
        } catch (err) {
          console.error(`[ADJUSTER] Failed to notify ${crew.crew_name}:`, err);
        }
      }

      // Mark adjustment as executed
      adjustment.status = 'executed';
      adjustment.executedAt = new Date();
      adjustment.notificationsSent = notificationsSent;

      return { success: true, notificationsSent };
    } catch (err) {
      console.error('[ADJUSTER] Error executing adjustment:', err);
      return { success: false, error: err.message };
    }
  }

  // Notify TM for approval
  async notifyTMForApproval(userId, adjustment) {
    // This would typically send an SMS or in-app notification to the TM
    console.log(`[ADJUSTER] Pending approval for adjustment ${adjustment.id}`);
    
    // In a real implementation, this would:
    // 1. Send SMS to TM with adjustment details
    // 2. Provide a link or code to approve/reject
    // 3. Store the pending adjustment
  }

  // Approve pending adjustment
  async approveAdjustment(adjustmentId) {
    const adjustment = this.pendingAdjustments.get(adjustmentId);
    if (!adjustment) {
      return { error: 'Adjustment not found' };
    }

    adjustment.status = 'approved';
    adjustment.approvedAt = new Date();
    
    const result = await this.executeAdjustment(adjustment);
    
    // Remove from pending
    this.pendingAdjustments.delete(adjustmentId);
    
    return result;
  }
}

module.exports = new TmScheduleAdjuster();
