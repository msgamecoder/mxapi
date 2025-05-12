// File: mxgamecoder/mxsachat/mxgenerateid.js
const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const authMiddleware = require("../mxmiddleware/authMiddleware");

// Helper to generate unique SaChat ID suggestions
function generateSaChatIDs(username) {
  const timestamp = Date.now().toString().slice(-4);
  const base = username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);

  const styles = [
    `${base}_${timestamp}`,
    `${base}.x${Math.floor(Math.random() * 99)}`,
    `mx_${base}${Math.floor(Math.random() * 1000)}`,
    `${base}${Math.floor(Math.random() * 99)}_sc`,
    `x${base}_id${Math.floor(Math.random() * 999)}`,
    `sc_${base}_${Math.floor(Math.random() * 900) + 100}`,
    `${base}_live${Math.floor(Math.random() * 100)}`
  ];

  return styles;
}

// Check if user already has an ID
router.get("/sachat/ids", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const check = await pool.query("SELECT sachat_id FROM sachat_users WHERE user_id = $1", [userId]);

    if (check.rows.length > 0 && check.rows[0].sachat_id) {
      return res.json({ exists: true, sachat_id: check.rows[0].sachat_id });
    }

    const userRes = await pool.query("SELECT username FROM users WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const username = userRes.rows[0].username;
    const idOptions = generateSaChatIDs(username);

    res.json({ exists: false, options: idOptions });
  } catch (err) {
    console.error("Generate ID error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Save chosen SaChat ID
router.post("/sachat/ids", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { selectedId } = req.body;

  if (!selectedId || selectedId.length < 4) return res.status(400).json({ error: "Invalid ID" });

  try {
    const conflict = await pool.query("SELECT 1 FROM sachat_users WHERE sachat_id = $1", [selectedId]);
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: "ID already taken" });
    }

    const insert = await pool.query(`
      INSERT INTO sachat_users (user_id, sachat_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET sachat_id = EXCLUDED.sachat_id
    `, [userId, selectedId]);

    res.json({ success: true });
  } catch (err) {
    console.error("Saving ID error:", err.message);
    res.status(500).json({ error: "Failed to save ID" });
  }
});

module.exports = router;
