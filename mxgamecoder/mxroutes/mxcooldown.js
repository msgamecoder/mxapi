// mxcooldown.js
const mxdatabase = require("../mxconfig/mxdatabase");

const COOLDOWN_LIMIT = 6; // Number of attempts
const COOLDOWN_DURATION_MS = 2 * 60 * 1000; // Cooldown time in ms (e.g., 2 minutes)

// Function to check and update cooldown
async function checkAndUpdateCooldown(userId, routeName) {
  const now = Date.now();
  const query = `SELECT cooldown_routes FROM users WHERE id = $1`;
  const result = await mxdatabase.query(query, [userId]);

  const cooldownRoutes = result.rows[0]?.cooldown_routes || {};

  // Check if the user is on cooldown for the route
  const cooldownUntil = cooldownRoutes[routeName];
  if (cooldownUntil && now < new Date(cooldownUntil).getTime()) {
    const secondsLeft = Math.ceil((new Date(cooldownUntil) - now) / 1000);
    return { cooldown: true, remaining: secondsLeft };
  }

  // No cooldown, update the user's cooldown route usage
  return { cooldown: false };
}

module.exports = { checkAndUpdateCooldown };
