// backend/services/tmMapsService.js
const axios = require('axios');

class TmMapsService {
  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
    console.log('[MAPS] API Key loaded:', this.apiKey ? 'Yes' : 'No');
    this.baseUrl = 'https://maps.googleapis.com/maps/api';
    
    if (!this.apiKey) {
      console.warn('[MAPS] No Google Maps API key found - travel features disabled');
    }
  }

  async getTravelTime(origin, destination, mode = 'driving', departureTime = null) {
    if (!this.apiKey) {
      return { error: 'Maps API not configured' };
    }
      console.log('[MAPS] API Request:', {
        url: `${this.baseUrl}/directions/json`,
        origin,
        destination,
        keyPresent: !!this.apiKey
      });

    try {
      const params = {
        origin,
        destination,
        mode,
        key: this.apiKey,
        departure_time: departureTime || 'now',
        traffic_model: 'best_guess'
      };

      const response = await axios.get(`${this.baseUrl}/directions/json`, { params });
      
      if (response.data.status !== 'OK') {
        console.error('[MAPS] API error:', response.data.status, response.data.error_message || response.data);
        return { error: `Route not found: ${response.data.status}` };
      }

      const route = response.data.routes[0];
      const leg = route.legs[0];
      
      return {
        duration: leg.duration,
        durationInTraffic: leg.duration_in_traffic || leg.duration,
        distance: leg.distance,
        startAddress: leg.start_address,
        endAddress: leg.end_address
      };
    } catch (err) {
      console.error('[MAPS] Error getting travel time:', err.message);
      return { error: 'Failed to get travel time' };
    }
  }
}

module.exports = new TmMapsService();
