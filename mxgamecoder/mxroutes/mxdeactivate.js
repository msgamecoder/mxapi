const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { getWorkingAPI } = require("../mxconfig/mxapi");

// 📧 Email Setup
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

// 📤 Request Deactivation
router.post("/deactivate-account", async (req, res) => {
    try {
        const { email, username, reason, days } = req.body;
        if (!email || !username || !reason || !days) {
            return res.status(400).json({ error: "❌ All fields are required." });
        }

        const userResult = await pool.query("SELECT * FROM users WHERE email = $1 AND username = $2", [email, username]);
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "❌ User not found." });
        }

        const user = userResult.rows[0];
        const isPremium = user.premium === true;

        const token = crypto.randomBytes(32).toString("hex");
        const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 mins to confirm

        // Store request with 'days'
        await pool.query(`
            INSERT INTO deactivation_requests (user_id, email, username, reason, token, expiration, is_premium, days)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [user.id, email, username, reason, token, expiration, isPremium, days]);

        // Send confirmation link
        const apiUrl = await getWorkingAPI();
        const confirmLink = `${apiUrl}/mx/confirm-deactivate?token=${token}&email=${encodeURIComponent(email)}`;
        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: "Confirm Account Deactivation",
            html: `
                <p>Hello <b>${username}</b>,</p>
                <p>You requested to deactivate your account. Click the link below to confirm:</p>
                <a href="${confirmLink}" style="color: orange; font-weight: bold;">Confirm Deactivation</a>
                <p>This link expires in 10 minutes.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: "📧 Deactivation confirmation email sent." });
    } catch (err) {
        console.error("❌ Deactivation error:", err);
        res.status(500).json({ error: "⚠️ Internal server error." });
    }
});

// Confirm Deactivation
router.get("/confirm-deactivate", async (req, res) => {
    try {
        const { token, email } = req.query;

        const result = await pool.query("SELECT * FROM deactivation_requests WHERE email = $1 AND token = $2 AND confirmed = false", [email, token]);

        if (result.rowCount === 0) {
            return res.status(400).send("❌ Invalid or expired request.");
        }

        const request = result.rows[0];
        const now = Date.now();

        if (now > new Date(request.expiration).getTime()) {
            return res.status(400).send("❌ Token expired.");
        }

        // Soft deactivate
        await pool.query("UPDATE users SET is_deactivated = TRUE WHERE id = $1", [request.user_id]);
        await pool.query("UPDATE deactivation_requests SET confirmed = TRUE WHERE token = $1", [token]);

        // Use the custom number of days selected by the user
        const deactivationDuration = request.days || 7; // Default to 7 days if no custom duration is provided
        const durationMs = deactivationDuration * 24 * 60 * 60 * 1000; // Convert days to milliseconds

        // Set auto-reactivation
        setTimeout(async () => {
            await pool.query("UPDATE users SET is_deactivated = FALSE WHERE id = $1", [request.user_id]);

            const mailOptions = {
                from: process.env.SMTP_EMAIL,
                to: email,
                subject: "Account Reactivated",
                html: `
                    <p>Hello <b>${request.username}</b>,</p>
                    <p>Your account has been automatically reactivated after your deactivation period.</p>
                    <p>Welcome back to MSWORLD! 😊</p>
                `
            };
            await transporter.sendMail(mailOptions);
        }, durationMs);

        // Redirect to deactivated page
        res.redirect("https://mxgamecoder.lovestoblog.com/mxdeactivated.html");
    } catch (err) {
        console.error("❌ Confirm deactivation error:", err);
        res.status(500).send("⚠️ Internal server error.");
    }
});

module.exports = router;
