const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase'); // Database connection
const { sendEmailNotification, generateFrontendNotification } = require("../mxutils/mxnotify");

const defaultAvatar = '/mxfiles/avatar.png'; // Path to default avatar image

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

        // ⏳ Check if token expired with a small buffer (5 minutes)
        const expirationBuffer = 5 * 60 * 1000; // 5 minutes buffer
        if (new Date(user.token_expires_at) + expirationBuffer < new Date()) {
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

        // ✅ Move user to users table and set default avatar
        await pool.query(`
            INSERT INTO users (full_name, username, email, phone_number, password_hash, location, profile_picture, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, '/mxfiles/avatar.png'), NOW())
        `, [user.full_name, user.username, user.email, user.phone_number, user.password_hash, user.location, defaultAvatar]);        

        // Delete from temp_users after successful migration
        await pool.query(`DELETE FROM temp_users WHERE id = $1`, [user.id]);

        // 📩 Send Welcome Email (Run in background for speed)
        sendEmailNotification(user.email, "🎉 Welcome to MSWORLD!", 
            `Hello ${user.username}, <br><br>
             Congratulations! 🎉 Your email has been successfully verified. <br><br>
             You can now <a href="https://mxgamecoder.lovestoblog.com/login.html">log in</a> to access all MSWORLD features! <br><br>
             🚀 Explore the community, connect with friends, and enjoy the MSWORLD experience. <br><br>
             If you have any questions or need assistance, don't hesitate to reach out to our support team. We're here to help! <br><br>
             We’re thrilled to have you on board! 🎉 <br><br>
             - The MSWORLD Team`
        , user.username).catch(err => console.error("❌ Email failed:", err));

        // 🔗 Redirect to login page
        return res.redirect('https://mxgamecoder.lovestoblog.com/submit.html');  // Redirect to the login page

    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({ error: "⚠️ Internal server error." });
    }
});


module.exports = router;
