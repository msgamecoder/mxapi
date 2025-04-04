const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase'); // Database connection
const bcrypt = require('bcryptjs'); // Use bcrypt for hashing
const crypto = require('crypto'); // For token generation
const nodemailer = require('nodemailer');
require('dotenv').config();
const VERIFICATION_URL = process.env.VERIFICATION_URL;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});

// 📝 Register User Route
router.post('/', async (req, res) => {
    try {
        const { full_name, username, email, phone_number, password, location, dob } = req.body;

        // 🔍 Check if user exists
        const checkResult = await pool.query(
            `SELECT 1 FROM users WHERE email = $1 OR username = $2 OR phone_number = $3
             UNION 
             SELECT 1 FROM temp_users WHERE email = $1 OR username = $2 OR phone_number = $3`,
            [email, username, phone_number]
        );

        if (checkResult.rowCount > 0) {
            return res.status(400).json({ error: '❌ User already exists' });
        }

        // 🔑 Hash Password (Use bcrypt)
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 🛡️ Generate Verification Token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

        // 🗃️ Insert User into `temp_users`
        await pool.query(
            `INSERT INTO temp_users (full_name, username, email, phone_number, password_hash, location, dob, verification_token, token_expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [full_name, username, email, phone_number, passwordHash, location, dob, verificationToken, tokenExpiresAt]
        );

// 📩 Send Verification Email
const verificationLink = `${VERIFICATION_URL}/${verificationToken}`;
transporter.sendMail({
    from: process.env.SMTP_EMAIL,
    to: email,
    subject: '🚀 Verify Your Email - MSWORLD',
    html: `
        <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; background-color: #f8f8f8;">
            <h2 style="text-align: center; color: #4CAF50; font-size: 22px;">Welcome to MSWORLD! 🎉</h2>
            <p style="font-size: 14px; text-align: center;">Hi ${username},</p>
            <p style="font-size: 14px; text-align: center;">You're almost done! Please verify your email to complete your registration.</p>
            <p style="text-align: center;">
                <a href="${verificationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; font-size: 16px; border-radius: 5px;">Verify Your Email</a>
            </p>
            <p style="font-size: 12px; color: #777; text-align: center;">This link will expire in 2 minutes. ⏳</p>
            <p style="font-size: 12px; text-align: center; color: #555;">If you didn’t sign up for MSWORLD, you can ignore this message.</p>
            <br>
            <footer style="text-align: center; font-size: 12px; color: #555;">
                <p>Thanks for joining MSWORLD! 😊</p>
                <p>- The MSWORLD Team</p>
            </footer>
        </div>
    `
}).catch(err => console.error("❌ Email sending failed:", err));

return res.json({ message: '✅ Registration successful! Please check your email for verification. If you didn’t receive it, check your spam folder.' });
    } catch (error) {
        console.error('❌ Registration Error:', error);
        return res.status(500).json({ error: '⚠️ Internal server error. Please try again.' });
    }
});

module.exports = router;
