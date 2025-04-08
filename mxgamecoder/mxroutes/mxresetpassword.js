const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const nodemailer = require("nodemailer");
require("dotenv").config();

// 📩 SEND RESET CONFIRMATION EMAIL
async function sendResetConfirmationEmail(to, username) {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const mailOptions = {
    from: `"MSWORLD Security" <${process.env.SMTP_EMAIL}>`,
    to,
    subject: "✅ Your Password Was Changed",
    html: `
      <p>Hello <b>${username}</b>,</p>
      <p>Your MSWORLD password was successfully updated.</p>
      <p>If this wasn't you, please reset your password immediately!</p>
    `,
  };

  await transporter.sendMail(mailOptions);
}

// GET: Serve reset form
router.get("/reset-password-form", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/reset-password-form.html"));
});

// GET: Verify token and redirect to form
router.get("/reset-password", (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "❌ No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token verified. Redirecting...");
    res.redirect(`https://mxapi.onrender.com/mx/reset-password-form?token=${token}`);
  } catch (error) {
    console.error("❌ Token invalid:", error.message);
    res.status(400).json({ error: "❌ Invalid or expired reset link." });
  }
});

// POST: Handle reset form submission
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  console.log("🔍 Received:", { token, newPassword });

  if (!token || !newPassword) {
    return res.status(400).json({ error: "❌ Token and new password are required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;
    console.log("✅ Token decoded for:", email);

    const tokenResult = await pool.query(
      "SELECT token_expires_at FROM users WHERE email = $1 AND reset_token = $2",
      [email, token]
    );

    if (
      tokenResult.rows.length === 0 ||
      new Date() > new Date(tokenResult.rows[0].token_expires_at)
    ) {
      return res.status(400).json({ error: "❌ Reset link has expired." });
    }

    const userResult = await pool.query(
      "SELECT password_hash, username, last_password_change FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "❌ User not found!" });
    }

    const user = userResult.rows[0];
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);

    if (isSamePassword) {
      return res.status(400).json({ error: "❌ New password cannot be same as old!" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password_hash = $1, last_password_change = NOW(), reset_token = NULL, token_expires_at = NULL WHERE email = $2",
      [hashedPassword, email]
    );

    await sendResetConfirmationEmail(email, user.username);

    let message = "✅ Password reset successfully!";
    if (user.last_password_change) {
      const last = new Date(user.last_password_change);
      const now = new Date();
      const daysAgo = Math.floor((now - last) / (1000 * 60 * 60 * 24));
      if (daysAgo > 0) {
        message += ` Your last change was ${daysAgo} days ago.`;
      }
    }

    console.log("✅ Password updated for", email);
    res.status(200).json({ message });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(400).json({ error: "❌ Invalid or expired reset link." });
  }
});

module.exports = router;
