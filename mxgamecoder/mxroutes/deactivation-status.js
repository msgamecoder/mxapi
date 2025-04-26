// mxroutes/deactivation-status.js
const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const authenticateToken = require("../middleware/authenticateToken"); // ⬅️ make sure you have JWT middleware

router.get("/deactivation-status", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; // JWT user id

        const result = await pool.query(`
            SELECT is_deactivated, reactivate_at 
            FROM users 
            WHERE id = $1
        `, [userId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "❌ User not found." });
        }

        const user = result.rows[0];

        if (!user.is_deactivated) {
            return res.json({ status: "active" });
        }

        const now = new Date();
        const reactivateAt = new Date(user.reactivate_at);
        const remainingMs = reactivateAt - now;
        const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

        res.json({
            status: "deactivated",
            reactivateAt: user.reactivate_at,
            remainingDays: remainingDays
        });

    } catch (err) {
        console.error("❌ Deactivation status error:", err);
        res.status(500).json({ error: "⚠️ Server error." });
    }
});

// Reactivate Account (forgiving version)
router.post('/reactivate', authenticateToken, async (req, res) => {
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
      return res.status(400).json({ error: "⚠️ Account is already active." });
    }

    await pool.query(`
      UPDATE users 
      SET is_deactivated = false, reactivate_at = NULL
      WHERE id = $1
    `, [userId]);

    res.status(200).json({ message: "✅ Account successfully reactivated (even before cooldown)." });

  } catch (err) {
    console.error("❌ Reactivate error:", err);
    res.status(500).json({ error: "⚠️ Server error. Please try again." });
  }
});

module.exports = router;
