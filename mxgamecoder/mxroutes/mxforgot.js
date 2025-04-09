const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { sendEmailNotification } = require("../mxutils/mxnotify");

// Generate a 6-digit verification code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000); // Random 6-digit number
}

router.post("/forgot-password", async (req, res) => {
  try {
    const { userInput } = req.body;

    // 🔍 Check if user exists (by email or username)
    const query = `SELECT email, username FROM users WHERE username = $1 OR email = $1 LIMIT 1`;
    const result = await pool.query(query, [userInput]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "❌ User not found" });
    }

    const user = result.rows[0];
    const email = user.email;

    // 🔑 Generate 6-digit code
    const code = generateCode();

    // 🛡️ Set expiration time for the code (e.g., 15 minutes)
    const codeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // 💾 Store code in DB
    await pool.query(
      "UPDATE users SET reset_token = $1, token_expires_at = $2 WHERE email = $3",
      [code, codeExpiresAt, email]
    );

    console.log("📨 Reset code generated:", code);

    // ✅ Send response FIRST
    res.status(200).json({ message: "✅ Code sent to your email" });

    // 📩 Send email with code
    sendEmailNotification(
      email,
      "Password Reset Request",
      `Your password reset code is: ${code}. This code will expire in 15 minutes.`,
      user.username
    ).catch(err => console.error("❌ Email failed:", err));

  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ message: "❌ Server error" });
  }
});

// Optional: Validate the code
router.post("/validate-code", async (req, res) => {
  const { email, code } = req.body;

  try {
    // 🛡️ Check if code is correct and not expired
    const query = `SELECT reset_token, token_expires_at FROM users WHERE email = $1 LIMIT 1`;
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "❌ User not found" });
    }

    const user = result.rows[0];
    const storedCode = user.reset_code;
    const codeExpiresAt = user.code_expires_at;

    // 🔑 Validate code
    if (storedCode !== code) {
      return res.status(400).json({ message: "❌ Invalid code" });
    }

    // 🔑 Check if the code has expired
    if (new Date() > new Date(codeExpiresAt)) {
      return res.status(400).json({ message: "❌ Code expired" });
    }

    // ✅ Code is valid
    res.status(200).json({ message: "✅ Code is valid" });

  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ message: "❌ Server error" });
  }
});

module.exports = router;
