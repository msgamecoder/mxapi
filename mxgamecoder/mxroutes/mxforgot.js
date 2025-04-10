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
    console.log("Received forgot password request for user:", userInput);

    // 🔍 Check if user exists (by email or username)
    const query = `SELECT * FROM users WHERE email = $1 OR username = $1 LIMIT 1`;
    const { rows } = await pool.query(query, [userInput]);

    if (rows.length === 0) {
      console.log("❌ User not found for email/username:", userInput);
      return res.status(400).json({ message: "❌ User not found" });
    }

    const user = rows[0];
    console.log("User found:", user);

    // Generate reset code and expiration
    const resetCode = generateResetCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Expires in 15 minutes
    console.log("Generated reset code:", resetCode, "Expires at:", expiresAt);

    // Update reset code in database
    const updateQuery = `UPDATE users SET reset_code = $1, reset_code_expires_at = $2 WHERE email = $3 RETURNING *`;
    await pool.query(updateQuery, [resetCode, expiresAt, userInput]);
    console.log("Updated reset code for user:", userInput);

    // Send email with reset code (nodemailer)
    await sendResetCodeEmail(user.email, resetCode);
    console.log("Reset code email sent to:", user.email);

    res.status(200).json({ message: "✅ Reset code sent!" });
  } catch (error) {
    console.error("❌ Error in forgot-password:", error);
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
    const storedCode = user.reset_token;
    const codeExpiresAt = user.token_expires_at;
    
    // 🔑 Validate code
    if (storedCode !== code) {
      return res.status(400).json({ message: "❌ Invalid code" });
    }

    // 🔑 Check if the code has expired
    if (new Date() > new Date(codeExpiresAt)) {
      return res.status(400).json({ message: "❌ Code expired" });
    }

    // 💾 Mark the code as used by setting reset_token to NULL
    await pool.query(
      `UPDATE users SET reset_token = NULL, token_expires_at = NULL WHERE email = $1`,
      [email]
    );

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
    // 🕵️‍♂️ Find user by email
    const userQuery = `SELECT * FROM users WHERE email = $1 LIMIT 1`;
    const result = await pool.query(userQuery, [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "❌ Invalid or expired code" });
    }

    const user = result.rows[0];
    const now = new Date();

    // ⏰ Check if code expired
    if (now > new Date(user.token_expires_at)) {
      return res.status(400).json({ error: "❌ Reset code has expired" });
    }

    // 🧠 Check if new password is same as old password
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
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

    // Clear reset token and expiration
    await pool.query("UPDATE users SET reset_token = NULL, token_expires_at = NULL WHERE email = $1", [email]);

    res.status(200).json({ message: "✅ Password reset successfully!" });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ error: "❌ Server error" });
  }
});


module.exports = router;
