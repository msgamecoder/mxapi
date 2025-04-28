// mxroutes/deactivate-account.js
const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const nodemailer = require("nodemailer");
const authMiddleware = require("../mxmiddleware/authMiddleware");  // Import auth

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

// 📤 Deactivate Account
router.post("/deactivate-account", authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query(
            "SELECT * FROM users WHERE id = $1", [req.user.id]
        );
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "❌ User not found." });
        }

        const user = userResult.rows[0];

        const deactivateUntil = new Date();
        deactivateUntil.setDate(deactivateUntil.getDate() + 30); // Always 30 days

        await pool.query(
            "UPDATE users SET is_deactivated = $1, deactivated_until = $2 WHERE id = $3",
            [true, deactivateUntil, req.user.id]
        );

        // Send email to user
        await transporter.sendMail({
            from: process.env.SMTP_EMAIL,
            to: user.email,
            subject: "Account Deactivation Confirmation",
            text: `Your MSWORLD account has been successfully deactivated for 30 days. We can't wait to welcome you back! 🌟🎉`
        });

        res.status(200).json({ message: "✅ Account deactivated successfully." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "❌ Server error." });
    }
});

// Add this new route for checking deactivation status
router.get("/deactivation-status", authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query(
            "SELECT * FROM users WHERE id = $1", [req.user.id]
        );
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "❌ User not found." });
        }

        const user = userResult.rows[0];

        // Check if the user is deactivated
        if (user.is_deactivated) {
            const remainingDays = Math.ceil((new Date(user.deactivated_until) - new Date()) / (1000 * 60 * 60 * 24)); 
            return res.status(200).json({
                status: "deactivated",
                reactivateAt: user.deactivated_until,
                remainingDays: remainingDays > 0 ? remainingDays : 0
            });
        }

        return res.status(200).json({
            status: "active"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "❌ Server error while checking deactivation status." });
    }
});

module.exports = router;
