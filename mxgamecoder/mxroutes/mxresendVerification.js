const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase'); // Database connection
const bcrypt = require('bcryptjs'); // Use bcrypt for password comparison
const crypto = require('crypto'); // For token generation
const nodemailer = require('nodemailer');
const Bull = require('bull');  // Correct import
require('dotenv').config();
const VERIFICATION_URL = process.env.VERIFICATION_URL;

// Configure the mailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
});

// Create an email queue for background tasks
const emailQueue = new Bull('emailQueue'); // Use Bull constructor instead

// Email job processor
emailQueue.process(async (job) => {
    try {
        await transporter.sendMail(job.data);
    } catch (err) {
        console.error('❌ Failed to send email:', err);
    }
});

// 📝 Resend Verification Route
router.post('/resend-verification', async (req, res) => {
    try {
        const { usernameOrEmail, password } = req.body;  // Use the consistent name

        // Make sure to search for both email and username
        const result = await pool.query(
            `SELECT * FROM temp_users WHERE email = $1 OR username = $1`, 
            [usernameOrEmail]
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

        // 📩 Send Verification Email using email queue (Non-blocking)
        const verificationLink = `${VERIFICATION_URL}/${verificationToken}`;
        emailQueue.add({
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
        });

        return res.json({ message: '✅ Verification email has been resent. Please check your inbox.' });

    } catch (error) {
        console.error('❌ Resend Verification Error:', error);
        return res.status(500).json({ error: '⚠️ Internal server error. Please try again.' });
    }
});

// 📝 Check Account Status Route (Temp Users)
router.post('/check_account_status', async (req, res) => {
    try {
        const { email } = req.body;

        const result = await pool.query(
            `SELECT * FROM temp_users WHERE email = $1 OR username = $1`,
            [email]  // can be username or email
        );
          
        if (result.rowCount === 0) {
            return res.status(400).json({ error: '❌ No account found with this email.' });
        }

        const user = result.rows[0];

        // 🔑 If the account is not verified, redirect
        if (user.verification_token !== null) {
            return res.redirect('https://mxgamecoder.lovestoblog.com/index.html');
        }
        
        return res.json({ success: true });

    } catch (error) {
        console.error('❌ Check Account Status Error:', error);
        return res.status(500).json({ error: '⚠️ Internal server error. Please try again.' });
    }
});

// 📝 Verification Route to move user details to users table
router.get('/:token', async (req, res) => {
    const { token } = req.params;

    try {
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
        const expirationBuffer = 15 * 60 * 1000; // 15 minutes buffer
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

        // ✅ Move user to users table
        await pool.query(` 
            INSERT INTO users (full_name, username, email, phone_number, password_hash, location, profile_picture, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, '/mxfiles/avatar.png'), NOW()) 
        `, [user.full_name, user.username, user.email, user.phone_number, user.password_hash, user.location, '/mxfiles/avatar.png']);        

        // Delete from temp_users after successful migration
        await pool.query(`DELETE FROM temp_users WHERE id = $1`, [user.id]);

        // 📩 Send Welcome Email using email queue (Non-blocking)
        emailQueue.add({
            from: process.env.SMTP_EMAIL,
            to: user.email,
            subject: '🎉 Welcome to MSWORLD!',
            html: `Hello ${user.username}, <br><br>
             Congratulations! 🎉 Your email has been successfully verified. <br><br>
             You can now <a href="https://mxgamecoder.lovestoblog.com/login.html">log in</a> to access all MSWORLD features! <br><br>
             🚀 Explore the community, connect with friends, and enjoy the MSWORLD experience. <br><br>
             If you have any questions or need assistance, don't hesitate to reach out to our support team. We're here to help! <br><br>
             We’re thrilled to have you on board! 🎉 <br><br>
             - The MSWORLD Team`
        });

        // 🔗 Redirect to login page
        return res.redirect('https://mxgamecoder.lovestoblog.com/submit.html');  // Redirect to the login page

    } catch (error) {
        console.error('❌ Verification error:', error);
        res.status(500).json({ error: "⚠️ Internal server error." });
    }
});

module.exports = router;
