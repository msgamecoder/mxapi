// File: mxgamecoder/mxsachat/mxgenerateid.js
const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const authMiddleware = require("../mxmiddleware/authMiddleware");

// Reject any ID with link-like content
const forbiddenLinkPattern = /(http|https|\.com|\.net|\.org|\.io|www\.)/i;

// Fast + safe SaChat ID generator
function generateSaChatIDs(username) {
  const base = username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  const emojis = ["✨", "🔥", "💬", "🧠", "👾", "😎"];
  const suggestions = [];

  for (let i = 0; i < 6; i++) {
    const emoji = emojis[i % emojis.length];
    const number = Math.floor(1000 + Math.random() * 9000); // 4-digit random
    suggestions.push(`${base}${emoji}${number}`);
  }
  return suggestions;
}

// GET: Suggest or return existing SaChat ID
router.get("/sachat/ids", authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const [existing, userRes] = await Promise.all([
      pool.query("SELECT sachat_id FROM sachat_users WHERE user_id = $1", [userId]),
      pool.query("SELECT username FROM users WHERE id = $1", [userId])
    ]);

    if (existing.rows.length > 0) {
      return res.json({ exists: true, sachat_id: existing.rows[0].sachat_id });
    }

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "🚫 User not found." });
    }

    const username = userRes.rows[0].username;
    const options = generateSaChatIDs(username);
    res.json({ exists: false, options });

  } catch (err) {
    console.error("Generate ID error:", err);
    res.status(500).json({ error: "💥 Server error. Please try again later." });
  }
});

// POST: Check or Save SaChat ID
router.post("/sachat/ids", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { selectedId, mode } = req.body;

  // Sanitize and validate
  const safeId = String(selectedId || "").trim();

  if (!safeId || safeId.length < 6 || safeId.length > 15) {
    return res.status(400).json({ error: "🚫 ID must be between 6 and 15 characters." });
  }

  if (forbiddenLinkPattern.test(safeId)) {
    return res.status(400).json({ error: "🚫 Links are not allowed in IDs (e.g., '.com', 'http')." });
  }

  try {
    const conflict = await pool.query("SELECT 1 FROM sachat_users WHERE sachat_id = $1", [safeId]);

    if (conflict.rows.length > 0) {
      const userRes = await pool.query("SELECT username FROM users WHERE id = $1", [userId]);
      const username = userRes.rows[0]?.username || "user";
      const suggestions = generateSaChatIDs(username);

      return res.status(409).json({
        error: "❌ This ID is already taken.",
        suggestions
      });
    }

    if (mode === "check") {
      return res.json({ success: true, saved: false, message: "✅ This ID is available! 🎉" });
    }

    // Save or update the user's SaChat ID
    await pool.query(
      `INSERT INTO sachat_users (user_id, sachat_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET sachat_id = EXCLUDED.sachat_id`,
      [userId, safeId]
    );

    res.json({ success: true, saved: true, message: "🎉 ID saved successfully and locked in! 🛡️" });

  } catch (err) {
    console.error("Save ID error:", err.message);
    res.status(500).json({ error: "💥 Server error while saving your ID. Please try again." });
  }
});

module.exports = router;
