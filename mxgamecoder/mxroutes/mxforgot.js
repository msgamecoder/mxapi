const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { sendEmailNotification } = require("../mxutils/mxnotify");

router.post("/forgot-password", async (req, res) => {
  try {
    const { userInput } = req.body;

    // Check if user exists (by username or email)
    const query = `SELECT email, username FROM users WHERE username = $1 OR email = $1 LIMIT 1`;
    const result = await pool.query(query, [userInput]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "❌ User not found" });
    }

    const user = result.rows[0];
    const email = user.email;

    // Generate reset token (valid for 15 minutes)
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "15m" });

    // Store reset token & expiry in the database
    await pool.query(
      "UPDATE users SET reset_token = $1, token_expires_at = NOW() + INTERVAL '15 minutes' WHERE email = $2",
      [token, email]
    );

    // Generate Reset Link
    const resetLink = `https://mxapi.onrender.com/mx/reset-password?token=${token}`;

    // Log time for debugging email delay
    console.log("📨 Reset email sent at:", new Date().toLocaleTimeString());

    // 📩 Send email notification
    sendEmailNotification(
      email,
      "Password Reset Request",
      `You requested a password reset. Click the link below:<br><br>
       <a href="${resetLink}" style="color:blue;">Reset Password</a><br><br>
       This link will expire in 15 minutes.`,
      user.username
    ).catch(err => console.error("❌ Email failed:", err));

    res.status(200).json({ message: "✅ Reset link sent to your email" });

  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ message: "❌ Server error" });
  }
});

// Optional: Check token manually
router.get("/check-token", (req, res) => {
  const { token } = req.query;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.status(200).json({ message: "✅ Token is valid", decoded });
  } catch (error) {
    res.status(400).json({ message: "❌ Token expired or invalid" });
  }
});

module.exports = router;
