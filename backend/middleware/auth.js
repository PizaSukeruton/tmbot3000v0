const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

// JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET || 'tmbot3000-dev-secret-change-in-production';

// Hash password
const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Verify password
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username, 
      role_id: user.role_id,
      role_name: user.role_name 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.session.token;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get fresh user data with role information
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.role_id, u.first_name, u.last_name,
             r.role_name, r.permissions
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = $1 AND u.is_active = true
    `, [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Authorization middleware - checks permissions array
const authorize = (requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // If no permissions required, just check if authenticated
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    
    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: requiredPermissions,
        userHas: userPermissions
      });
    }

    next();
  };
};

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  authenticate,
  authorize
};
