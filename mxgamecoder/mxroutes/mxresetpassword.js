const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const path = require("path");
const { sendEmailNotification } = require("../mxutils/mxnotify");

// Serve the Reset Password Form
router.get("/reset-password-form", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/reset-password-form.html"));
});

// Step 1: Verify Token & Redirect to Reset Form
router.get("/reset-password", (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "❌ No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token verified. Redirecting user...");
    res.redirect(`https://mxapi.onrender.com/mx/reset-password-form?token=${token}`);
  } catch (error) {
    console.error("❌ Token verification failed:", error.message);
    res.status(400).json({ error: "❌ Invalid or expired reset link." });
  }
});

// Step 2: Handle Password Reset
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  console.log("🔍 Received data:", { token, newPassword });

  if (!token || !newPassword) {
    return res.status(400).json({ error: "❌ Token and new password are required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;
    console.log("✅ Token decoded, email:", email);

    // Check token expiry from DB (optional extra protection)
    const tokenResult = await pool.query(
      "SELECT token_expires_at FROM users WHERE email = $1 AND reset_token = $2",
      [email, token]
    );

    if (tokenResult.rows.length === 0 || new Date() > new Date(tokenResult.rows[0].token_expires_at)) {
      return res.status(400).json({ error: "❌ Reset link has expired." });
    }

    // Get current password info
    const userResult = await pool.query(
      "SELECT password_hash, username, last_password_change FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "❌ User not found!" });
    }

    const user = userResult.rows[0];

    // Check if password is same as old one
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ error: "❌ New password cannot be the same as the old password!" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password + clear token
    const updateResult = await pool.query(
      "UPDATE users SET password_hash = $1, last_password_change = NOW(), reset_token = NULL, token_expires_at = NULL WHERE email = $2 RETURNING *",
      [hashedPassword, email]
    );

    let message = "✅ Password reset successfully!";
    if (user.last_password_change) {
      const lastChangeDate = new Date(user.last_password_change);
      const now = new Date();
      const daysAgo = Math.floor((now - lastChangeDate) / (1000 * 60 * 60 * 24));
      if (daysAgo > 0) {
        message += ` Your last password change was ${daysAgo} days ago.`;
      }
    }

    // 📩 Send notification
    sendEmailNotification(
      email,
      "Your Password Was Changed",
      "Your MSWORLD password was successfully updated. If this wasn't you, please reset your password immediately!",
      user.username
    ).catch(err => console.error("❌ Email failed:", err));

    console.log("✅ Password successfully updated for", email);
    res.status(200).json({ message });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(400).json({ error: "❌ Invalid or expired reset link." });
  }
});

module.exports = router;