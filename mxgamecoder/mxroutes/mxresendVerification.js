const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase'); // Database connection
const bcrypt = require('bcryptjs'); // Use bcrypt for password comparison
const crypto = require('crypto'); // For token generation
const nodemailer = require('nodemailer');
require('dotenv').config();
const VERIFICATION_URL = process.env.VERIFICATION_URL;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});

// 📝 Resend Verification Route
router.post('/resend-verification', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 🔍 Check if email exists in temp_users
        const result = await pool.query(
            `SELECT * FROM temp_users WHERE email = $1`, 
            [email]
        );

        if (result.rowCount === 0) {
            return res.status(400).json({ error: '❌ No account found with this email.' });
        }

        const user = result.rows[0];

        // 🔑 Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(400).json({ error: '❌ Incorrect password.' });
        }

        // 🛡️ Generate new Verification Token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

        // Update verification token and expiration in temp_users
        await pool.query(
            `UPDATE temp_users SET verification_token = $1, token_expires_at = $2 WHERE id = $3`,
            [verificationToken, tokenExpiresAt, user.id]
        );

        // 📩 Send Verification Email
        const verificationLink = `${VERIFICATION_URL}/${verificationToken}`;
        transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: user.email,
            subject: '🚀 Verify Your Email - MSWORLD',
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; background-color: #f8f8f8;">
                    <h2 style="text-align: center; color: #4CAF50; font-size: 20px;">Welcome to MSWORLD! 🎉</h2>
                    <p style="font-size: 14px; text-align: center;">Hi ${user.username} 👋,</p>
                    <p style="font-size: 14px; text-align: center;">You’re almost there! To complete your registration, please verify your email. ✨</p>
                    <p style="text-align: center;">
                        <a href="${verificationLink}" style="background-color: #007bff; color: white; padding: 8px 16px; text-decoration: none; font-size: 14px; border-radius: 5px; display: inline-block;">Verify Your Email 📧</a>
                    </p>
                    <p style="font-size: 12px; color: #777; text-align: center;">This link will expire in 24 hours ⏳.</p>
                    <p style="font-size: 12px; text-align: center; color: #555;">If you didn’t sign up for MSWORLD, feel free to ignore this email. 🚫</p>
                    <br>
                    <footer style="text-align: center; font-size: 12px; color: #555;">
                        <p>Thanks for joining MSWORLD! 🙏</p>
                        <p>- The MSWORLD Team 💼</p>
                    </footer>
                </div>
            `
        }).catch(err => console.error("❌ Email sending failed:", err));

        return res.json({ message: '✅ Verification email has been resent. Please check your inbox.' });

    } catch (error) {
        console.error('❌ Resend Verification Error:', error);
        return res.status(500).json({ error: '⚠️ Internal server error. Please try again.' });
    }
});

module.exports = router;
