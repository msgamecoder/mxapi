const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase'); // Database connection
const crypto = require('crypto'); // For password hashing & token generation
const nodemailer = require('nodemailer');
require('dotenv').config();
const VERIFICATION_URL = process.env.VERIFICATION_URL;

// 📩 Setup Nodemailer transporter (Reuse connection for speed)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});

// 📝 Register User Route
router.post('/', async (req, res) => {
    try {
        const { full_name, username, email, phone_number, password, location, dob } = req.body;

        // 🔍 Check if user exists in `users` or `temp_users`
        const checkResult = await pool.query(
            `SELECT 1 FROM users WHERE email = $1 OR username = $2 OR phone_number = $3
             UNION 
             SELECT 1 FROM temp_users WHERE email = $1 OR username = $2 OR phone_number = $3`,
            [email, username, phone_number]
        );

        if (checkResult.rowCount > 0) {
            return res.status(400).json({ error: '❌ User already exists' });
        }

        // 🔑 Hash Password (Faster with SHA-256)
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

        // 🛡️ Generate Verification Token (Use URL-safe encoding)
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

        // 🗃️ Insert User into `temp_users`
        await pool.query(
            `INSERT INTO temp_users (full_name, username, email, phone_number, password_hash, location, dob, verification_token, token_expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [full_name, username, email, phone_number, passwordHash, location, dob, verificationToken, tokenExpiresAt]
        );

        // 📩 Send Verification Email (Non-blocking for speed)
        const verificationLink = `${VERIFICATION_URL}/${verificationToken}`;

        transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: '🚀 Verify Your Email - MSWORLD',
            text: `Hello ${username},\n\nClick the link below to verify your email:\n${verificationLink}\n\n✅ MSWORLD Team`
        }).catch(err => console.error("❌ Email sending failed:", err));

        return res.json({ message: '✅ Registration successful! Please check your email for verification.' });

    } catch (error) {
        console.error('❌ Registration Error:', error);
        return res.status(500).json({ error: '⚠️ Internal server error. Please try again.' });
    }
});

module.exports = router;
