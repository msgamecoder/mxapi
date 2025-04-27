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
        const { reason } = req.body; // No need for days in the request

        if (!reason) {
            return res.status(400).json({ error: "❌ Reason is required." });
        }

        const userResult = await pool.query(
            "SELECT * FROM users WHERE id = $1", [req.user.id]
        );
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "❌ User not found." });
        }

        const user = userResult.rows[0];

        // Set the fixed deactivation period to 30 days for all users
        const numericDays = 30;

        const deactivateUntil = new Date();
        deactivateUntil.setDate(deactivateUntil.getDate() + numericDays);

        // Update the database
        await pool.query(
            "UPDATE users SET is_deactivated = $1, deactivated_until = $2 WHERE id = $3", 
            [true, deactivateUntil, req.user.id]
        );        

        // Send email notification
        await transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: user.email,
            subject: "Account Deactivation Confirmation",
            text: `Your account has been successfully deactivated for 30 days. You can reactivate it anytime by logging in again. ⚡️`,
        });

        res.status(200).json({ message: "✅ Account deactivated successfully." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "❌ Server error." });
    }
});

module.exports = router;
