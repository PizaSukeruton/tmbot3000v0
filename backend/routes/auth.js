const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');const { hashPassword, verifyPassword, generateToken, authenticate, authorize } = require(path.join(__dirname, '../middleware/auth'));
const pool = require(path.join(__dirname, '../db/pool'));

// Generate secure random token
const generateInviteToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Send invite (Tour Manager only)
router.post('/invite', authenticate, authorize(['create_users']), async (req, res) => {
  try {
    const { email, role_id } = req.body;

    if (!email || !role_id) {
      return res.status(400).json({ error: 'Email and role_id required' });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Check if invite already exists and is valid
    const existingInvite = await pool.query(
      'SELECT id FROM invites WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()',
      [email]
    );
    if (existingInvite.rows.length > 0) {
      return res.status(400).json({ error: 'Active invite already exists for this email' });
    }

    // Create invite token
    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await pool.query(
      'INSERT INTO invites (token, email, role_id, invited_by, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [token, email, role_id, req.user.id, expiresAt]
    );

    res.json({
      message: 'Invite created successfully',
      invite_id: result.rows[0].id,
      invite_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?token=${token}`
    });

  } catch (error) {
    console.error('Invite creation error:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// Register with invite token
router.post('/register', async (req, res) => {
  try {
    const { token, username, password, first_name, last_name } = req.body;

    if (!token || !username || !password || !first_name || !last_name) {
      return res.status(400).json({ error: 'All fields required' });
    }

    // Validate invite token
    const inviteResult = await pool.query(
      'SELECT email, role_id FROM invites WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()',
      [token]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired invite token' });
    }

    const invite = inviteResult.rows[0];

    // Check if username already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const password_hash = await hashPassword(password);

    // Create user
    const userResult = await pool.query(
      'INSERT INTO users (username, email, password_hash, role_id, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [username, invite.email, password_hash, invite.role_id, first_name, last_name]
    );

    // Mark invite as used
    await pool.query('UPDATE invites SET used_at = NOW() WHERE token = $1', [token]);

    res.json({
      message: 'Registration successful',
      user_id: userResult.rows[0].id
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Get user with role information
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.password_hash, u.role_id, 
             u.first_name, u.last_name, r.role_name, r.permissions
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.username = $1 AND u.is_active = true
    `, [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await verifyPassword(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user);

    // Store token in session
    req.session.token = token;
    req.session.userId = user.id;

    // Return user info (without password hash)
    const { password_hash, ...userInfo } = user;
    res.json({
      message: 'Login successful',
      token,
      user: userInfo
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Get current user info
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;

// Admin verification endpoint
router.get('/verify-admin/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find the invite
    const invite = await pool.query(
      'SELECT * FROM invites WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()',
      [token]
    );

    if (invite.rows.length === 0) {
      return res.status(400).send(`
        <h2>Invalid or Expired Link</h2>
        <p>This verification link is invalid or has expired.</p>
        <p>Please contact support if you need assistance.</p>
      `);
    }

    const inviteData = invite.rows[0];

    // Show admin setup form
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>TMBot3000 - Admin Setup</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
          .form-group { margin-bottom: 15px; }
          label { display: block; margin-bottom: 5px; font-weight: bold; }
          input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
          button { background-color: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
          button:hover { background-color: #45a049; }
        </style>
      </head>
      <body>
        <h2>Complete TMBot3000 Admin Setup</h2>
        <form action="/api/auth/complete-admin-setup" method="POST">
          <input type="hidden" name="token" value="${token}">
          
          <div class="form-group">
            <label for="username">Username:</label>
            <input type="text" id="username" name="username" required>
          </div>
          
          <div class="form-group">
            <label for="firstName">First Name:</label>
            <input type="text" id="firstName" name="firstName" required>
          </div>
          
          <div class="form-group">
            <label for="lastName">Last Name:</label>
            <input type="text" id="lastName" name="lastName" required>
          </div>
          
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required minlength="8">
          </div>
          
          <div class="form-group">
            <label for="confirmPassword">Confirm Password:</label>
            <input type="password" id="confirmPassword" name="confirmPassword" required>
          </div>
          
          <button type="submit">Create Admin Account</button>
        </form>
        
        <script>
          document.querySelector('form').addEventListener('submit', function(e) {
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
              e.preventDefault();
              alert('Passwords do not match');
            }
          });
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('[AUTH] Admin verification error:', error);
    res.status(500).send('Internal server error');
  }
});

// Admin verification endpoint
router.get('/verify-admin/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find the invite
    const invite = await pool.query(
      'SELECT * FROM invites WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()',
      [token]
    );

    if (invite.rows.length === 0) {
      return res.status(400).send(`
        <h2>Invalid or Expired Link</h2>
        <p>This verification link is invalid or has expired.</p>
        <p>Please contact support if you need assistance.</p>
      `);
    }

    const inviteData = invite.rows[0];

    // Show admin setup form
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>TMBot3000 - Admin Setup</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
          .form-group { margin-bottom: 15px; }
          label { display: block; margin-bottom: 5px; font-weight: bold; }
          input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
          button { background-color: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; }
          button:hover { background-color: #45a049; }
        </style>
      </head>
      <body>
        <h2>Complete TMBot3000 Admin Setup</h2>
        <form action="/api/auth/complete-admin-setup" method="POST">
          <input type="hidden" name="token" value="${token}">
          
          <div class="form-group">
            <label for="username">Username:</label>
            <input type="text" id="username" name="username" required>
          </div>
          
          <div class="form-group">
            <label for="firstName">First Name:</label>
            <input type="text" id="firstName" name="firstName" required>
          </div>
          
          <div class="form-group">
            <label for="lastName">Last Name:</label>
            <input type="text" id="lastName" name="lastName" required>
          </div>
          
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required minlength="8">
          </div>
          
          <div class="form-group">
            <label for="confirmPassword">Confirm Password:</label>
            <input type="password" id="confirmPassword" name="confirmPassword" required>
          </div>
          
          <button type="submit">Create Admin Account</button>
        </form>
        
        <script>
          document.querySelector('form').addEventListener('submit', function(e) {
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
              e.preventDefault();
              alert('Passwords do not match');
            }
          });
        </script>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('[AUTH] Admin verification error:', error);
    res.status(500).send('Internal server error');
  }
});
