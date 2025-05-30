const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getWorkingAPI } = require('../mxconfig/mxapi'); 
require('dotenv').config();

// ✉️ Email Transporter Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

// 📝 Register User Route
router.post('/', async (req, res) => {
    try {
        const { full_name, username, email, phone_number, password, location, dob } = req.body;

        // 🔍 Check if user already exists
        const checkResult = await pool.query(
            `SELECT 1 FROM users WHERE email = $1 OR username = $2 OR phone_number = $3
             UNION
             SELECT 1 FROM temp_users WHERE email = $1 OR username = $2 OR phone_number = $3`,
            [email, username, phone_number]
        );

        if (checkResult.rowCount > 0) {
            return res.status(400).json({ error: '❌ User already exists' });
        }

        // 🔐 Hash Password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // 🛡️ Generate Verification Token (Valid for 24 hours)
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // 🗃️ Store Temp User
        await pool.query(
            `INSERT INTO temp_users (full_name, username, email, phone_number, password_hash, location, dob, verification_token, token_expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [full_name, username, email, phone_number, passwordHash, location, dob, verificationToken, tokenExpiresAt]
        );

        // 🌐 Get Working API for Verification Link
        const apiUrl = await getWorkingAPI();
        const verificationLink = `${apiUrl}/${verificationToken}`;

        // 📩 Send Verification Email
        try {
            await transporter.sendMail({
                from: process.env.SMTP_EMAIL,
                to: email,
                subject: '🚀 Verify Your Email - MSWORLD',
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; background-color: #f8f8f8;">
                        <h2 style="text-align: center; color: #4CAF50; font-size: 20px;">Welcome to MSWORLD! 🎉</h2>
                        <p style="font-size: 14px; text-align: center;">Hi ${username} 👋,</p>
                        <p style="font-size: 14px; text-align: center;">You’re almost there! To complete your registration, please verify your email. ✨</p>
                        <p style="text-align: center;">
                            <a href="${verificationLink}" style="background-color: #007bff; color: white; padding: 8px 16px; text-decoration: none; font-size: 14px; border-radius: 5px; display: inline-block;">Verify Your Email 📧</a>
                        </p>
                        <p style="font-size: 12px; color: #777; text-align: center;">This link will expire in <strong>24 hours ⏳</strong>.</p>
                        <p style="font-size: 12px; text-align: center; color: #555;">If you didn’t sign up for MSWORLD, feel free to ignore this email. 🚫</p>
                        <br>
                        <footer style="text-align: center; font-size: 12px; color: #555;">
                            <p>Thanks for joining MSWORLD! 🙏</p>
                            <p>- The MSWORLD Team 💼</p>
                        </footer>
                    </div>
                `
            });
        } catch (emailErr) {
            console.error("❌ Email sending failed:", emailErr);
            return res.status(500).json({ error: "⚠️ Failed to send verification email. Please try again later." });
        }

        return res.json({
            message: '✅ Registration successful! Please check your email and click the verification link. If you didn’t receive it, check your spam folder. 📩'
        });
    } catch (error) {
        console.error('❌ Registration Error:', error);
        return res.status(500).json({ error: '⚠️ Internal server error. Please try again.' });
    }
});

module.exports = router;
