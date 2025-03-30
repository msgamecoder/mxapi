const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase'); // Database connection
const crypto = require('crypto'); // For password hashing
const jwt = require('jsonwebtoken'); // JWT for authentication
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sendEmailNotification } = require("../mxutils/mxnotify");

router.post('/', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        // 🔍 Find user by email or username
        const userQuery = `
            SELECT id, username, LOWER(email) AS email, password_hash 
            FROM users 
            WHERE LOWER(email) = LOWER($1) OR username = $1
        `;
        const result = await pool.query(userQuery, [identifier]);

        if (result.rowCount === 0) {
            return res.status(400).json({ error: '❌ User not found. Check your details.' });
        }

        const user = result.rows[0];

// 🔑 Verify password using bcrypt.compare()
const isMatch = await bcrypt.compare(password, user.password_hash);
if (!isMatch) {
    return res.status(401).json({ error: '🚫 Incorrect password' });
}

        // 🎫 Generate JWT Token (FIXED)
        const token = jwt.sign(
            { id: user.id, username: user.username }, 
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );

   //     console.log("Generated JWT Token:", token); // 🔥 Debugging: Show JWT

        // ✅ Send only ONE response (Fix ERR_HTTP_HEADERS_SENT)
        res.status(200).json({ message: "✅ Login successful", token });

        // 📩 Send email notification if email exists
        if (user.email) {
            sendEmailNotification(
                user.email, 
                "New Login Detected", 
                "You just logged into your MSWORLD account.", 
                user.username
            ).catch(err => console.error("❌ Email failed:", err));
        }

    } catch (error) {
        console.error('❌ Login error:', error);
        return res.status(500).json({ error: '⚠️ Internal server error. Try again.' });
    }
});

module.exports = router;
