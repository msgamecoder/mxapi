const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { sendEmailNotification } = require("../mxutils/mxnotify");

router.post('/', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        // 🔍 Find user by email or username (include is_deleting and is_deactivated)
const userQuery = `
    SELECT id, username, LOWER(email) AS email, password_hash, phone_number, is_deleting, is_deactivated
    FROM users 
    WHERE LOWER(email) = LOWER($1) OR username = $1
`;
        const result = await pool.query(userQuery, [identifier]);

        if (result.rowCount === 0) {
            return res.status(400).json({ error: '❌ User not found. Check your details.' });
        }

        const user = result.rows[0];

        // ⛔ Check if account is being deleted
        if (user.is_deleting) {
            return res.status(403).json({ error: "⛔ Account is in the process of deletion. Login is disabled." });
        }

        // 🔑 Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: '🚫 Incorrect password' });
        }

        // 🎫 Generate JWT Token (expires in 7 days)
const token = jwt.sign(
    { id: user.id, username: user.username, phone_number: user.phone_number },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
);

        // ✅ If deactivated, send a special response
        if (user.is_deactivated) {
            return res.status(200).json({
                message: "⚠️ Account deactivated",
                token,
                redirect: "https://mxgamecoder.lovestoblog.com/deactivated.html"
            });
        }

        // ✅ Normal login
        res.status(200).json({ message: "✅ Login successful", token });

        // 📩 Send email notification
        if (user.email) {
            sendEmailNotification(
                user.email,
                "New Login Detected",
                "You just logged into your MSWORLD account.",
                user.username,
                user.id
            ).catch(err => console.error("❌ Email failed:", err));
        }

    } catch (error) {
        console.error('❌ Login error:', error);
        return res.status(500).json({ error: '⚠️ Internal server error. Try again.' });
    }
});

module.exports = router;
