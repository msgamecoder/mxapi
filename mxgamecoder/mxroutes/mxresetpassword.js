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
    
    // Debugging log
    console.log("✅ Token verified. Redirecting user...");

    // Redirect user to frontend reset form with token
    res.redirect(`https://mxapi.onrender.com/mx/reset-password-form?token=${token}`);
  } catch (error) {
    console.error("❌ Token verification failed:", error.message);
    res.status(400).json({ error: "❌ Invalid or expired reset link." });
  }
});

// Step 2: Handle Password Reset
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  // Debugging log
  console.log("🔍 Received data:", { token, newPassword });

  if (!token || !newPassword) {
    return res.status(400).json({ error: "❌ Token and new password are required." });
  }

  try {
    // Verify Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    console.log("✅ Token decoded, email:", email);

    // Get the user's current password and last password change date
    const userResult = await pool.query(
      "SELECT password_hash, username, last_password_change FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "❌ User not found!" });
    }

    const user = userResult.rows[0];

  // Check if new password is the same as the old one
const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
if (isSamePassword) {
    console.log("❌ New password is the same as the old one!"); // Debugging log
    return res.status(400).json({ error: "❌ New password cannot be the same as the old password!" });
}

    // Hash New Password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update Password in Database and Set Last Password Change Date
    const updateResult = await pool.query(
      "UPDATE users SET password_hash = $1, last_password_change = NOW(), reset_token = NULL, token_expires_at = NULL WHERE email = $2 RETURNING *",
      [hashedPassword, email]
    );  

    // Handle `last_password_change` if NULL
    let message = "✅ Password reset successfully!";
    if (user.last_password_change) {
      const lastChangeDate = new Date(user.last_password_change);
      const now = new Date();
      const timeDifference = Math.floor((now - lastChangeDate) / (1000 * 60 * 60 * 24)); // Convert to days

      if (timeDifference > 0) {
        message += ` Your last password change was ${timeDifference} days ago.`;
      }
    }

    // 📩 Send email notification
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