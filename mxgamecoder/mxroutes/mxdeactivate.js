// mxroutes/deactivate-account.js
const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const nodemailer = require("nodemailer");
const authMiddleware = require("../mxmiddleware/authMiddleware");  // Import the authentication middleware

// 📧 Email Setup
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

// 📤 Request Deactivation
router.post("/deactivate-account", authMiddleware, async (req, res) => {
    try {
        const { reason, days } = req.body;
        if (!reason || !days) {
            return res.status(400).json({ error: "❌ All fields are required." });
        }

        const userResult = await pool.query(
            "SELECT * FROM users WHERE id = $1", [req.user.id]
        );
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "❌ User not found." });
        }

        const user = userResult.rows[0];
        const isPremium = user.premium === true;

        const numericDays = Number(days);
        if (!numericDays || numericDays < 1 || (!isPremium && numericDays > 14)) {
            return res.status(403).json({
                error: isPremium 
                    ? "❌ Invalid custom days requested." 
                    : "❌ Only premium users can select custom deactivation days."
            });
        }

        const deactivateUntil = new Date();
        deactivateUntil.setDate(deactivateUntil.getDate() + numericDays);

        await pool.query(
            "UPDATE users SET is_deactivated = $1, deactivated_until = $2 WHERE id = $3", 
            [true, deactivateUntil, req.user.id]
        );        

        await transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: user.email,
            subject: "Account Deactivation Confirmation",
            text: `Your account has been successfully deactivated for ${numericDays} day(s). You can reactivate it anytime by logging in again.`,
        });

        res.status(200).json({ message: "✅ Account deactivated successfully." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "❌ Server error." });
    }
});

module.exports = router;
