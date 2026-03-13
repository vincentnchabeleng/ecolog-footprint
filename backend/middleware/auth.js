const jwt  = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect middleware — verifies the JWT in the Authorization header.
 * Attaches req.user to the request on success.
 */
const protect = async (req, res, next) => {
  let token;

  // Extract token from "Authorization: Bearer <token>"
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated — please log in.' });
  }

  try {
    // Verify and decode
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user (without password)
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired — please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token — please log in again.' });
  }
};

module.exports = { protect };
