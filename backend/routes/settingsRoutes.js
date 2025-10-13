// backend/routes/settingsRoutes.js
// Routes for managing TM settings

const express = require('express');
const router = express.Router();
const settingsManager = require('../services/tmSettingsManager');
const { authenticate, requireRole } = require('../middleware/authMiddleware');

// Get current settings
router.get('/settings/:showId', authenticate, requireRole('tm'), async (req, res) => {
  try {
    const settings = await settingsManager.getSettings(
      req.user.userId,
      req.params.showId
    );
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings
router.put('/settings/:showId', authenticate, requireRole('tm'), async (req, res) => {
  try {
    const settings = await settingsManager.updateSettings(
      req.user.userId,
      req.params.showId,
      req.body
    );
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Add crew notification preferences
router.post('/settings/crew-notifications', authenticate, requireRole('tm'), async (req, res) => {
  try {
    const pref = await settingsManager.addCrewNotificationPref(req.body);
    res.json(pref);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add crew preference' });
  }
});

// Toggle specific settings
router.post('/settings/:showId/toggle/:setting', authenticate, requireRole('tm'), async (req, res) => {
  try {
    const { setting } = req.params;
    const toggleableSettings = [
      'traffic_monitoring_enabled',
      'auto_adjust_enabled',
      'auto_notify_on_adjustment',
      'notify_all_crew',
      'notify_local_drivers',
      'notify_department_heads'
    ];

    if (!toggleableSettings.includes(setting)) {
      return res.status(400).json({ error: 'Invalid toggle setting' });
    }

    // Get current value and toggle it
    const current = await settingsManager.getSettings(
      req.user.userId,
      req.params.showId
    );
    
    const newValue = !current[setting];
    
    const updated = await settingsManager.updateSettings(
      req.user.userId,
      req.params.showId,
      { [setting]: newValue }
    );

    res.json({ 
      setting, 
      previousValue: current[setting], 
      newValue: updated[setting] 
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle setting' });
  }
});

module.exports = router;
