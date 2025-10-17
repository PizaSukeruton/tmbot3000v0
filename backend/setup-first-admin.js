// setup-first-admin.js
// Creates first admin user and sends email verification

require('dotenv').config();
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');
const pool = require('./db/pool');

async function setupFirstAdmin() {
  console.log('[SETUP] Setting up first admin user...');

  try {
    // Check if any users exist
    const userCount = await pool.query('SELECT COUNT(*) FROM users');
    
    if (parseInt(userCount.rows[0].count) > 0) {
      console.log('[SETUP] Users already exist in system');
      return;
    }

    // Create basic tour_manager role if it doesn't exist
    const roleResult = await pool.query(
      `INSERT INTO roles (role_name, description, permissions) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (role_name) DO NOTHING 
       RETURNING id`,
      ['tour_manager', 'Tour Manager', []]
    );

    let roleId;
    if (roleResult.rows.length > 0) {
      roleId = roleResult.rows[0].id;
    } else {
      const existingRole = await pool.query('SELECT id FROM roles WHERE role_name = $1', ['tour_manager']);
      roleId = existingRole.rows[0].id;
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create verification record
    await pool.query(
      `INSERT INTO invites (token, email, role_id, invited_by, expires_at) 
       VALUES ($1, $2, $3, NULL, $4)`,
      [verificationToken, 'jamesedwardstraker@gmail.com', roleId, expiresAt]
    );

    // Setup SendGrid
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // Send verification email
    const verificationUrl = `https://tmbot3000v0.onrender.com/api/auth/verify-admin/${verificationToken}`;
    
    const msg = {
      to: 'jamesedwardstraker@gmail.com',
      from: 'jamesedwardstraker@gmail.com',
      subject: 'TMBot3000 - Setup Your Admin Account',
      html: `
        <h2>TMBot3000 Admin Setup</h2>
        <p>You're being set up as the main administrator for TMBot3000.</p>
        <p>Click the link below to complete your account setup:</p>
        <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px;">Complete Setup</a>
        <p>Or copy and paste this URL into your browser:</p>
        <p>${verificationUrl}</p>
        <p>This link expires in 24 hours.</p>
        <hr>
        <p><small>This is an automated message from TMBot3000</small></p>
      `
    };

    await sgMail.send(msg);

    console.log('[SETUP] ✅ Verification email sent to jamesedwardstraker@gmail.com');
    console.log('[SETUP] Check your email and click the verification link to complete setup');
    console.log(`[SETUP] Link expires in 24 hours`);

  } catch (error) {
    console.error('[SETUP] Error:', error.message);
    if (error.response) {
      console.error('[SETUP] SendGrid error:', error.response.body);
    }
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  setupFirstAdmin()
    .then(() => {
      console.log('[SETUP] Setup complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('[SETUP] Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupFirstAdmin };
