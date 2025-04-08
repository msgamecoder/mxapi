const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

// 📩 Send Reset Email (Independent & Spam-Free)
async function sendForgotPasswordEmail(to, username, resetLink) {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"MSWORLD Support 🚨" <${process.env.SMTP_EMAIL}>`,
    to,
    subject: "🔐 Reset Your MSWORLD Password",
    headers: {
      "X-Priority": "1",
      "X-MSMail-Priority": "High",
      Importance: "High",
    },
    html: `
      <div style="font-family:sans-serif;">
        <h2>Hello ${username} 👋,</h2>
        <p>You requested a password reset. Click the link below:</p>
        <a href="${resetLink}" style="background-color:#007bff;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;">
          Reset Password
        </a>
        <p style="margin-top:20px;">This link will expire in 15 minutes.</p>
        <hr>
        <small>If you didn't request this, you can ignore this email.</small>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// 🌐 POST: /forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { userInput } = req.body;

    const query = `SELECT email, username FROM users WHERE username = $1 OR email = $1 LIMIT 1`;
    const result = await pool.query(query, [userInput]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "❌ User not found" });
    }

    const user = result.rows[0];
    const email = user.email;

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "15m" });

    await pool.query(
      "UPDATE users SET reset_token = $1, token_expires_at = NOW() + INTERVAL '15 minutes' WHERE email = $2",
      [token, email]
    );

    const resetLink = `https://mxapi.onrender.com/mx/reset-password?token=${token}`;

    console.log("📨 Reset email sent at:", new Date().toLocaleTimeString());

    await sendForgotPasswordEmail(email, user.username, resetLink);

    res.status(200).json({ message: "✅ Reset link sent to your email" });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ message: "❌ Server error" });
  }
});

// ✅ Optional token check
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
