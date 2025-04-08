const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

// 📩 SEND RESET EMAIL (Personal Business 😅)
async function sendForgotPasswordEmail(to, username, link) {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"MSWORLD Support" <${process.env.SMTP_EMAIL}>`,
    to: email,
    subject: "Reset Your MSWORLD Password",
    text: `You requested a password reset. Click the link: ${resetLink}`,
    html: `
      <p>You requested a password reset. Click the link below:</p>
      <a href="${resetLink}" style="color:blue;">Reset Password</a>
      <p>This link will expire in 15 minutes.</p>
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
    console.error("❌ Error:", error);
    res.status(500).json({ message: "❌ Server error" });
  }
});

// 🌐 Optional: Check if token is valid
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
