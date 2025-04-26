// mxroutes/deactivate-account.js
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

        const userResult = await pool.query(
            "SELECT * FROM users WHERE email = $1 AND username = $2",
            [email, username]
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
                    ? "❌ Invalid custom days."
                    : "❌ Only premium users can select custom deactivation days."
            });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiration = new Date(Date.now() + 10 * 60 * 1000); // 10 mins to confirm

        await pool.query(`
            INSERT INTO deactivation_requests (user_id, email, username, reason, token, expiration, is_premium, days)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [user.id, email, username, reason, token, expiration, isPremium, numericDays]);

        // 🔥 Send response immediately (no delay)
        res.status(200).json({ message: "📧 Confirmation email is being sent." });

        // 📧 Now send email in the background (no await)
        const apiUrl = await getWorkingAPI();
        const confirmLink = `${apiUrl}/mx/confirm-deactivate?token=${token}&email=${encodeURIComponent(email)}`;
        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: "Confirm Account Deactivation",
            html: `
                <p>Hello <b>${username}</b>,</p>
                <p>You requested to deactivate your MSWORLD account.</p>
                <p>Click the button below to confirm:</p>
                <a href="${confirmLink}" style="color: orange; font-weight: bold;">✅ Confirm Deactivation</a>
                <p>This link expires in 10 minutes.</p>
            `
        };

        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                console.error("❌ Email sending failed:", err);
            } else {
                console.log("📧 Email sent successfully:", info.response);
            }
        });

    } catch (err) {
        console.error("❌ Deactivation error:", err);
        res.status(500).json({ error: "⚠️ Server error. Please try again." });
    }
});

// ✅ Confirm Deactivation
router.get("/confirm-deactivate", async (req, res) => {
    try {
        const { token, email } = req.query;

        const result = await pool.query(`
            SELECT * FROM deactivation_requests 
            WHERE email = $1 AND token = $2 AND confirmed = false
        `, [email, token]);

        if (result.rowCount === 0) {
            return res.status(400).send("❌ Invalid or expired token.");
        }

        const request = result.rows[0];
        const now = Date.now();

        if (now > new Date(request.expiration).getTime()) {
            return res.status(400).send("❌ Token expired.");
        }

        // Deactivate account
        await pool.query("UPDATE users SET is_deactivated = TRUE WHERE id = $1", [request.user_id]);
        await pool.query("UPDATE deactivation_requests SET confirmed = TRUE WHERE token = $1", [token]);

        const durationDays = Number(request.days) || 14;
        const durationMs = durationDays * 24 * 60 * 60 * 1000;

        // Reactivate after N days
        setTimeout(async () => {
            try {
                await pool.query("UPDATE users SET is_deactivated = FALSE WHERE id = $1", [request.user_id]);
                console.log(`✅ User ${request.username} reactivated automatically after ${durationDays} days.`);
            } catch (err) {
                console.error("⚠️ Auto-reactivation failed:", err);
            }
        }, durationMs);

        return res.send(`
            <div style="font-family: Arial; max-width: 600px; margin: auto; padding: 1.5rem; background: #f8f8f8; border-radius: 12px;">
                <h2 style="color: orange;">Account Deactivation Confirmed</h2>
                <p><strong>${request.username}</strong>, your account is now deactivated for <b>${durationDays} days</b>.</p>
                <p>You will receive an automatic reactivation after the selected duration.</p>
                <p>Thank you for using MSWORLD!</p>
            </div>
        `);
    } catch (err) {
        console.error("❌ Confirm error:", err);
        res.status(500).send("⚠️ Something went wrong. Please try again later.");
    }
});

module.exports = router;
