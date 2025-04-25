// mxcooldown.js
const mxdatabase = require("../mxconfig/mxdatabase");

const routeCooldowns = {
  "change-password": { cooldownPeriod: 2 * 60 * 1000, actionLimit: 6 }, // 2 mins, 6 actions
  "update-profile-picture": { cooldownPeriod: 5 * 60 * 1000, actionLimit: 3 }, // 5 mins, 3 actions
  // Add more routes if needed
};

module.exports = {
  async checkAndUpdateCooldown(userId, routeName) {
    try {
      const routeSettings = routeCooldowns[routeName];
      if (!routeSettings) {
        return { cooldown: false }; // No cooldown for untracked routes
      }

      const now = Date.now();
      const { cooldownPeriod, actionLimit } = routeSettings;

      const result = await mxdatabase.query(`
        SELECT last_used, cooldown_count, total_violations
        FROM user_cooldowns
        WHERE user_id = $1 AND route_name = $2
      `, [userId, routeName]);

      const cooldownData = result.rows[0];

      if (cooldownData) {
        const timeSinceLastUse = now - new Date(cooldownData.last_used).getTime();
        const remainingTime = cooldownPeriod - timeSinceLastUse;

        if (remainingTime > 0) {
          // Still inside cooldown window
          if (cooldownData.cooldown_count >= actionLimit) {
            // 🚨 User hit limit, increment strike count
            await mxdatabase.query(`
              UPDATE user_cooldowns
              SET total_violations = total_violations + 1
              WHERE user_id = $1 AND route_name = $2
            `, [userId, routeName]);

            return {
              cooldown: true,
              remaining: Math.ceil(remainingTime / 1000)
            };
          }

          // Allow, just increase count
          await mxdatabase.query(`
            UPDATE user_cooldowns
            SET cooldown_count = cooldown_count + 1, last_used = NOW()
            WHERE user_id = $1 AND route_name = $2
          `, [userId, routeName]);

          return { cooldown: false };
        } else {
          // ⏳ Cooldown expired, reset short-term count
          await mxdatabase.query(`
            UPDATE user_cooldowns
            SET cooldown_count = 1, last_used = NOW()
            WHERE user_id = $1 AND route_name = $2
          `, [userId, routeName]);

          return { cooldown: false };
        }

      } else {
        // First time: create row
        await mxdatabase.query(`
          INSERT INTO user_cooldowns (user_id, route_name, cooldown_count, last_used, total_violations)
          VALUES ($1, $2, 1, NOW(), 0)
        `, [userId, routeName]);

        return { cooldown: false };
      }
    } catch (error) {
      console.error("Cooldown check error:", error);
      throw new Error("Cooldown check failed");
    }
  }
};
