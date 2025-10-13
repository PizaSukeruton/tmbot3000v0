const axios = require('axios');

class TmFlightService {
  constructor() {
    this.apiKey = process.env.AVIATIONSTACK_API_KEY;
    this.baseUrl = 'http://api.aviationstack.com/v1';
    
    if (!this.apiKey) {
      console.warn('[FLIGHTS] No Aviation Stack API key found - flight tracking disabled');
    }
  }

  async getFlightStatus(flightNumber, date) {
    if (!this.apiKey) {
      return { error: 'Flight tracking not configured' };
    }

    try {
      const params = {
        access_key: this.apiKey,
        flight_iata: flightNumber
      };

      const response = await axios.get(`${this.baseUrl}/flights`, { params });
      
      if (response.data && response.data.data) {
        const flights = response.data.data;
        // Find flight matching the date
        const flight = flights.find(f => 
          f.flight_date && f.flight_date.startsWith(date)
        );
        
        if (flight) {
          return {
            status: flight.flight_status,
            departure: {
              airport: flight.departure.airport,
              scheduled: flight.departure.scheduled,
              actual: flight.departure.actual,
              terminal: flight.departure.terminal,
              gate: flight.departure.gate
            },
            arrival: {
              airport: flight.arrival.airport,
              scheduled: flight.arrival.scheduled,
              actual: flight.arrival.actual,
              terminal: flight.arrival.terminal,
              gate: flight.arrival.gate
            }
          };
        }
      }
      
      return { error: 'Flight not found' };
    } catch (err) {
      console.error('[FLIGHTS] Error getting flight status:', err.message);
      return { error: 'Failed to get flight status' };
    }
  }
}

module.exports = new TmFlightService();
