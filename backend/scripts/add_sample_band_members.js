// Script to add sample band members
const memberNotificationManager = require('../services/tmMemberNotificationManager');

async function addSampleBandMembers() {
  const showId = '#605002'; // Brisbane show
  
  const bandMembers = [
    { name: 'Alex Johnson', phone: '+61412555001', email: 'alex@band.com', role: 'Lead Vocals' },
    { name: 'Jamie Chen', phone: '+61412555002', email: 'jamie@band.com', role: 'Guitar' },
    { name: 'Sam Taylor', phone: '+61412555003', email: 'sam@band.com', role: 'Bass' },
    { name: 'Morgan Lee', phone: '+61412555004', email: 'morgan@band.com', role: 'Drums' }
  ];

  for (const member of bandMembers) {
    try {
      await memberNotificationManager.addBandMember(showId, member);
      console.log(`Added ${member.name} - ${member.role}`);
    } catch (err) {
      console.error(`Failed to add ${member.name}:`, err.message);
    }
  }
}

// Run if called directly
if (require.main === module) {
  addSampleBandMembers()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
