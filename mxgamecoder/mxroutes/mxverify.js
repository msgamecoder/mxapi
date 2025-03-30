const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase'); // Database connection
const { sendEmailNotification, generateFrontendNotification } = require("../mxutils/mxnotify");

router.get('/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // 🔍 Find user by token (Only select needed columns to speed up query)
        const result = await pool.query(
            `SELECT id, full_name, username, email, phone_number, password_hash, location, token_expires_at 
             FROM temp_users WHERE verification_token = $1`, 
            [token]
        );

        if (result.rowCount === 0) {
            return res.status(400).json({ error: "❌ Invalid or expired verification link." });
        }

        const user = result.rows[0];

        // ⏳ Check if token expired
        if (new Date(user.token_expires_at) < new Date()) {
            return res.status(400).json({ error: "⏳ Token expired. Please register again." });
        }

        // 🔍 Check if the email or username is already registered
        const existingUser = await pool.query(
            `SELECT 1 FROM users WHERE email = $1 OR username = $2 LIMIT 1`, 
            [user.email, user.username]
        );

        if (existingUser.rowCount > 0) {
            return res.status(400).json({ error: "⚠️ Email or username already exists." });
        }

        // ✅ Move user to users table (faster query)
        await pool.query(`
            INSERT INTO users (full_name, username, email, phone_number, password_hash, location, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `, [user.full_name, user.username, user.email, user.phone_number, user.password_hash, user.location]);
        
        await pool.query(`DELETE FROM temp_users WHERE id = $1`, [user.id]);

        // 📩 Send Welcome Email (Run in background for speed)
sendEmailNotification(user.email, "🎉 Welcome to MSWORLD!", 
    `Hello ${user.username}, <br><br>
     Your email has been successfully verified. <br>
     You can now <a href="https://your-msworld-login-page.com">log in</a>. <br><br>
     🚀 Enjoy using MSWORLD!`,
    user.username  // ✅ Add this parameter
).catch(err => console.error("❌ Email failed:", err));

        // 🔔 Frontend Notification
        const notification = generateFrontendNotification("success", "🎉 Registration successful! Welcome to MSWORLD.");

        return res.status(200).json({ message: "✅ Email verified successfully! You can now log in.", notification });

    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({ error: "⚠️ Internal server error." });
    }
});

module.exports = router;