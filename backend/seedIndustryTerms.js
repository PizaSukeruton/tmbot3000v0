// seedIndustryTerms.js
const pool = require('./db/pool');
const { generateHexId } = require('./utils/generateHexId');

const industryTerms = [
  { term: 'soundcheck', category: 'technical', definition: 'Pre-show audio equipment test and setup', aliases: ['sound test', 'audio check'] },
  { term: 'load in', category: 'logistics', definition: 'Process of bringing equipment into the venue', aliases: ['load-in', 'loadin'] },
  { term: 'load out', category: 'logistics', definition: 'Process of removing equipment from the venue', aliases: ['load-out', 'loadout'] },
  { term: 'curfew', category: 'production', definition: 'Time by which the show must end', aliases: ['cut off', 'end time'] },
  { term: 'lobby call', category: 'logistics', definition: 'Time to meet in hotel lobby for departure', aliases: ['lobby time', 'call time'] },
  { term: 'rider', category: 'hospitality', definition: 'Document listing artist requirements', aliases: ['hospitality rider', 'tech rider'] },
  { term: 'day sheet', category: 'logistics', definition: 'Daily schedule and information document', aliases: ['daysheet', 'schedule'] },
  { term: 'FOH', category: 'technical', definition: 'Front of House - main sound mixing position', aliases: ['front of house'] },
  { term: 'monitor', category: 'technical', definition: 'Stage speakers for performers to hear themselves', aliases: ['wedge', 'stage monitor'] },
  { term: 'per diem', category: 'financial', definition: 'Daily allowance for meals and incidentals', aliases: ['PD', 'daily allowance'] },
  { term: 'catering', category: 'hospitality', definition: 'Meals provided at the venue', aliases: ['venue meals', 'craft services'] },
  { term: 'buyout', category: 'financial', definition: 'Cash payment instead of providing catering', aliases: ['meal buyout', 'food buyout'] },
  { term: 'runner', category: 'logistics', definition: 'Person who handles errands and transport', aliases: ['driver', 'gopher'] },
  { term: 'onstage time', category: 'production', definition: 'Scheduled time for performance to begin', aliases: ['stage time', 'show time'] },
  { term: 'db limit', category: 'technical', definition: 'Maximum volume level allowed at venue', aliases: ['decibel limit', 'sound limit'] },
  { term: 'flight time', category: 'logistics', definition: 'Scheduled departure time for flights', aliases: ['departure time'] },
  { term: 'travel distance', category: 'logistics', definition: 'Distance between venues or to next location', aliases: ['drive time', 'travel time'] },
  { term: 'press schedule', category: 'production', definition: 'Media interviews and appearances timeline', aliases: ['media schedule', 'press day'] },
  { term: 'meet and greet', category: 'hospitality', definition: 'Scheduled fan interaction event', aliases: ['VIP meet', 'M&G'] }
];

async function seedTerms() {
  console.log('Starting to seed industry terms...\n');
  
  try {
    for (const termData of industryTerms) {
      const hexIdWithHash = await generateHexId('tm_term_id');
      const hexId = hexIdWithHash.substring(1); // Remove the # prefix
      
      await pool.query(
        `INSERT INTO industry_terms (term_id, term, category, definition, aliases) 
         VALUES ($1, $2, $3, $4, $5)`,
        [hexId, termData.term, termData.category, termData.definition, termData.aliases]
      );
      
      console.log(`✓ Added: ${hexId} - ${termData.term} (${termData.category})`);
    }
    
    console.log('\n✓ All industry terms seeded successfully!');
    
  } catch (err) {
    console.error('✗ Error seeding terms:', err.message);
  } finally {
    await pool.end();
  }
}

seedTerms();
