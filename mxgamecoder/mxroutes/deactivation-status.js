const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const authMiddleware = require("../mxmiddleware/authMiddleware");

// 🔥 Reactivate Account
router.post("/reactivate", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(`
      SELECT is_deactivated
      FROM users
      WHERE id = $1
    `, [userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "❌ User not found." });
    }

    const user = result.rows[0];

    if (!user.is_deactivated) {
      return res.status(400).json({ error: "⚠️ Account already active." });
    }

    await pool.query(`
      UPDATE users
      SET is_deactivated = false, deactivated_until = NULL
      WHERE id = $1
    `, [userId]);

    console.log(`✅ User ${userId} reactivated successfully.`);

    return res.status(200).json({ message: "✅ Account successfully reactivated." });

  } catch (err) {
    console.error("❌ Reactivation error:", err);
    return res.status(500).json({ error: "⚠️ Server error. Please try again." });
  }
});

module.exports = router;
