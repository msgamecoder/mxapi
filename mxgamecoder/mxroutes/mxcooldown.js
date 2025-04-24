// mxcooldown.js
const mxdatabase = require("../mxconfig/mxdatabase");

module.exports = {
  async checkAndUpdateCooldown(userId, routeName) {
    try {
      const now = Date.now();
      const cooldownPeriod = 2 * 60 * 1000; // 2 minutes cooldown period

      // Query the cooldown data for the specific user and route
      const query = `
        SELECT last_used, cooldown_count FROM user_cooldowns WHERE user_id = $1 AND route_name = $2
      `;
      const result = await mxdatabase.query(query, [userId, routeName]);
      const cooldownData = result.rows[0];

      if (cooldownData) {
        const timeSinceLastUse = now - new Date(cooldownData.last_used).getTime();
        const remainingTime = cooldownPeriod - timeSinceLastUse;

        if (remainingTime > 0) {
          // Update the cooldown count and time if within cooldown period
          await mxdatabase.query(`
            UPDATE user_cooldowns 
            SET cooldown_count = cooldown_count + 1, last_used = NOW() 
            WHERE user_id = $1 AND route_name = $2
          `, [userId, routeName]);

          return {
            cooldown: true,
            remaining: Math.ceil(remainingTime / 1000) // seconds remaining
          };
        } else {
          // Reset cooldown count if cooldown period passed
          await mxdatabase.query(`
            UPDATE user_cooldowns 
            SET cooldown_count = 1, last_used = NOW() 
            WHERE user_id = $1 AND route_name = $2
          `, [userId, routeName]);

          return { cooldown: false };
        }
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
