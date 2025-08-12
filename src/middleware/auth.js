// src/middleware/auth.js


const logger = require('../utils/logger');
// --- Brute-Force Protection Settings ---
const MAX_ATTEMPTS = 5; // Max failed attempts before locking out
const LOCK_TIME_MINUTES = 30; // How long to lock out the IP
const ATTEMPT_WINDOW_MINUTES = 15; // Reset attempts after this time has passed

const loginAttempts = {}; // In-memory store for failed attempts: { ip: { count, lockUntil } }

function authMiddleware(req, res, next) {
  const { ip } = req;

  if (loginAttempts[ip] && loginAttempts[ip].lockUntil > Date.now()) {
    logger.warn(`[Auth] Blocked login attempt from locked IP: ${ip}`);
    return res.status(403).send('Too many failed login attempts. Please try again later.');
  }

  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;

  if (!user || !pass) {
    logger.error('[Auth] Dashboard credentials are not set in the .env file.');
    return res.status(500).send('Authentication is not configured on the server.');
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Bot Dashboard"');
    return res.status(401).send('Authentication required.');
  }

  const [username, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');

  if (username === user && password === pass) {
    if (loginAttempts[ip]) {
      delete loginAttempts[ip];
    }
    return next();
  }

  logger.warn(`[Auth] Failed login attempt from IP: ${ip}`);
  const attempt = loginAttempts[ip] || { count: 0, firstAttempt: Date.now() };

  if (Date.now() - attempt.firstAttempt > ATTEMPT_WINDOW_MINUTES * 60 * 1000) {
    attempt.count = 0;
    attempt.firstAttempt = Date.now();
  }

  attempt.count += 1; // Replaced ++ with += 1
  loginAttempts[ip] = attempt;

  if (attempt.count >= MAX_ATTEMPTS) {
    loginAttempts[ip].lockUntil = Date.now() + LOCK_TIME_MINUTES * 60 * 1000;
    logger.error(`[Auth] IP locked due to too many failed attempts: ${ip}`);
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Bot Dashboard"');
  return res.status(401).send('Authentication failed.');
}

module.exports = { authMiddleware };
