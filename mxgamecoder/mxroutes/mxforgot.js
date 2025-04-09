const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

// 🔐 Forgot Password
router.post("/forgot-password", async (req, res) => {
  try {
    const { userInput } = req.body;

    // 🔍 Check user
    const result = await pool.query(
      "SELECT email, username FROM users WHERE username = $1 OR email = $1 LIMIT 1",
      [userInput]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "❌ User not found" });
    }

    const user = result.rows[0];
    const email = user.email;
    const username = user.username;

    // 🔑 Generate token
    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    // 💾 Save to DB
    await pool.query(
      "UPDATE users SET reset_token = $1, token_expires_at = NOW() + INTERVAL '15 minutes' WHERE email = $2",
      [token, email]
    );

    const resetLink = `https://mxapi.onrender.com/mx/reset-password?token=${token}`;

    // ✅ Send response immediately
    res.status(200).json({ message: "✅ Reset link sent to your email" });

    // 📩 Send email in background
    transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: email,
      subject: "🔐 Reset Your Password - MSWORLD",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; background-color: #f8f8f8;">
          <h2 style="text-align: center; color: #e67e22;">Password Reset Request</h2>
          <p style="text-align: center;">Hi ${username} 👋,</p>
          <p style="text-align: center;">You requested to reset your password. Click the link below:</p>
          <p style="text-align: center;">
            <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 8px 16px; text-decoration: none; border-radius: 5px;">Reset Password</a>
          </p>
          <p style="text-align: center; font-size: 12px; color: #777;">This link will expire in 15 minutes.</p>
          <p style="text-align: center; font-size: 12px; color: #777;">If you didn’t request this, feel free to ignore it.</p>
          <footer style="text-align: center; font-size: 12px; margin-top: 20px; color: #555;">
            - MSWORLD Support 💼
          </footer>
        </div>
      `,
    }).catch((err) => console.error("❌ Email sending failed:", err));

    console.log("📨 Email triggered at:", new Date().toLocaleTimeString());

  } catch (error) {
    console.error("❌ Forgot Password Error:", error);
    res.status(500).json({ message: "❌ Internal server error" });
  }
});

// ✅ Check token validity (optional but useful)
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
