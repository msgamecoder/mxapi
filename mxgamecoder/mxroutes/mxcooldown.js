const mxdatabase = require("../mxconfig/mxdatabase");

const routeCooldowns = {
  "change-password": { cooldownPeriod: 2 * 60 * 1000, actionLimit: 6 }, // 2 minutes, 6 actions
  "update-profile-picture": { cooldownPeriod: 5 * 60 * 1000, actionLimit: 3 }, // 5 minutes, 3 actions
};

module.exports = {
  async checkAndUpdateCooldown(userId, routeName) {
    try {
      // Get cooldown settings for the specific route
      const routeSettings = routeCooldowns[routeName];
      if (!routeSettings) {
        return { cooldown: false }; // No cooldown for routes not in the list
      }

      const now = Date.now();
      const { cooldownPeriod, actionLimit } = routeSettings;

      // Query the cooldown data for the specific user and route
      const query = `
        SELECT last_used, cooldown_count FROM user_cooldowns WHERE user_id = $1 AND route_name = $2
      `;
      const result = await mxdatabase.query(query, [userId, routeName]);
      const cooldownData = result.rows[0];

      if (cooldownData) {
        const timeSinceLastUse = now - new Date(cooldownData.last_used).getTime();
        const remainingTime = cooldownPeriod - timeSinceLastUse;

        // If it's been more than 1 minute, decay the cooldown count by 1
        if (timeSinceLastUse > 1 * 60 * 1000) { // 1 minute decay interval
          const newCooldownCount = Math.max(0, cooldownData.cooldown_count - 1); // Don't allow negative counts
          await mxdatabase.query(`
            UPDATE user_cooldowns 
            SET cooldown_count = $1, last_used = NOW() 
            WHERE user_id = $2 AND route_name = $3
          `, [newCooldownCount, userId, routeName]);
        }

        // Check if the user has exceeded the limit
        if (remainingTime > 0 && cooldownData.cooldown_count >= actionLimit) {
          return {
            cooldown: true,
            remaining: Math.ceil(remainingTime / 1000), // seconds remaining
          };
        }

        // Otherwise, update the count and time
        await mxdatabase.query(`
          UPDATE user_cooldowns 
          SET cooldown_count = cooldown_count + 1, last_used = NOW() 
          WHERE user_id = $1 AND route_name = $2
        `, [userId, routeName]);

        return { cooldown: false };
      } else {
        // Initialize record if it doesn't exist
        await mxdatabase.query(`
          INSERT INTO user_cooldowns (user_id, route_name, cooldown_count, last_used)
          VALUES ($1, $2, 1, NOW())
        `, [userId, routeName]);

        return { cooldown: false };
      }
    } catch (error) {
      console.error("Cooldown check error:", error);
      throw new Error("Cooldown check failed");
    }
  }
};
