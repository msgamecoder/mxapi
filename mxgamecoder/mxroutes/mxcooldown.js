const mxdatabase = require("../mxconfig/mxdatabase");

const COOLDOWN_LIMIT = 6; // 6 attempts
const COOLDOWN_DURATION_MS = 2 * 60 * 1000; // 2 minutes

// Map to keep recent route access count per user in-memory (optional)
const routeUsageCache = {};

function cleanupOldUsage(userId, route) {
  const now = Date.now();
  if (!routeUsageCache[userId]) routeUsageCache[userId] = {};
  if (!routeUsageCache[userId][route]) routeUsageCache[userId][route] = [];

  routeUsageCache[userId][route] = routeUsageCache[userId][route].filter(t => now - t < COOLDOWN_DURATION_MS);
}

const routeLimiter = (routeName) => {
  return async (req, res, next) => {
    try {
      const userId = req.userId;

      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      cleanupOldUsage(userId, routeName);

      // Fetch cooldown status from DB
      const query = `SELECT cooldown_routes FROM users WHERE id = $1`;
      const result = await mxdatabase.query(query, [userId]);
      const cooldownRoutes = result.rows[0]?.cooldown_routes || {};

      const cooldownUntil = cooldownRoutes?.[routeName];
      const now = Date.now();

      if (cooldownUntil && now < new Date(cooldownUntil).getTime()) {
        const secondsLeft = Math.ceil((new Date(cooldownUntil) - now) / 1000);
        return res.status(429).json({
          message: `🚫 You're on cooldown for this action. Please try again in ${secondsLeft} seconds.`,
        });
      }

      // Record usage
      routeUsageCache[userId][routeName].push(now);

      // If exceeded limit, apply cooldown
      if (routeUsageCache[userId][routeName].length >= COOLDOWN_LIMIT) {
        const newCooldown = new Date(now + COOLDOWN_DURATION_MS);
        cooldownRoutes[routeName] = newCooldown;

        const update = `UPDATE users SET cooldown_routes = $1 WHERE id = $2`;
        await mxdatabase.query(update, [cooldownRoutes, userId]);

        return res.status(429).json({
          message: `😵 Too many attempts! You're now on cooldown for 2 minutes.`,
        });
      }

      next();
    } catch (err) {
      console.error("Cooldown check error:", err);
      return res.status(500).json({ message: "Server error in cooldown check" });
    }
  };
};

module.exports = routeLimiter;
