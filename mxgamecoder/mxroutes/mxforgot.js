const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
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
    console.log("🔍 Checking if user exists with input:", userInput);
    const query = `SELECT email, username FROM users WHERE username = $1 OR email = $1 LIMIT 1`;
    const result = await pool.query(query, [userInput]);

    if (result.rows.length === 0) {
      console.log("❌ User not found");
      return res.status(404).json({ message: "❌ User not found" });
    }

    const user = result.rows[0];
    const email = user.email;

    // 🔑 Generate 6-digit code
    const code = generateCode();
    console.log("📨 Generated reset code:", code);

    // 🛡️ Set expiration time for the code (e.g., 15 minutes)
    const codeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
    console.log("🕰️ Code expiration time set to:", codeExpiresAt);

    // 💾 Store code in DB
    await pool.query(
      "UPDATE users SET reset_token = $1, token_expires_at = $2 WHERE email = $3",
      [code, codeExpiresAt, email]
    );
    console.log("📤 Reset code stored in DB");

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
    console.log("🔍 Validating reset code for email:", email);
    // 🛡️ Check if code is correct and not expired
    const query = `SELECT reset_token, token_expires_at FROM users WHERE email = $1 LIMIT 1`;
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      console.log("❌ User not found for validation");
      return res.status(404).json({ message: "❌ User not found" });
    }

    const user = result.rows[0];
    const storedCode = user.reset_token;
    const codeExpiresAt = user.token_expires_at;

    console.log("📖 Stored code:", storedCode);
    console.log("🕰️ Code expiration time:", codeExpiresAt);

    // 🔑 Validate code
    if (storedCode !== code) {
      console.log("❌ Invalid code");
      return res.status(400).json({ message: "❌ Invalid code" });
    }

    // 🔑 Check if the code has expired
    if (new Date() > new Date(codeExpiresAt)) {
      console.log("❌ Code expired");
      return res.status(400).json({ message: "❌ Code expired" });
    }

    // 💾 Mark the code as used by setting reset_token to NULL
    await pool.query(
      `UPDATE users SET reset_token = NULL, token_expires_at = NULL WHERE email = $1`,
      [email]
    );
    console.log("📤 Code marked as used");

    // ✅ Code is valid and marked as used
    res.status(200).json({ message: "✅ Code is valid" });

  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ message: "❌ Server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    console.log("🔍 Resetting password for email:", email);
    // 🕵️‍♂️ Find user by email
    const userQuery = `SELECT * FROM users WHERE email = $1 LIMIT 1`;
    const result = await pool.query(userQuery, [email]);

    if (result.rows.length === 0) {
      console.log("❌ Invalid or expired code");
      return res.status(400).json({ error: "❌ Invalid or expired code" });
    }

    const user = result.rows[0];
    const now = new Date();

    console.log("🕰️ Checking if reset code is expired:", user.token_expires_at);
    // ⏰ Check if code expired
    if (now > new Date(user.token_expires_at)) {
      console.log("❌ Reset code has expired");
      return res.status(400).json({ error: "❌ Reset code has expired" });
    }

    // 🧠 Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      console.log("❌ New password is the same as the old one");
      return res.status(400).json({ error: "❌ New password cannot be the same as the old one." });
    }

    // 🔒 Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password
    await pool.query(
      "UPDATE users SET password_hash = $1, last_password_change = NOW() WHERE email = $2",
      [hashedPassword, email]
    );
    console.log("🔐 Password successfully updated");

    // Clear reset token and expiration
    await pool.query("UPDATE users SET reset_token = NULL, token_expires_at = NULL WHERE email = $1", [email]);
    console.log("📤 Reset token cleared");

    res.status(200).json({ message: "✅ Password reset successfully!" });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: "❌ Server error" });
  }
});

module.exports = router;
