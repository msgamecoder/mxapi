const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const { getWorkingAPI } = require("../mxconfig/mxapi");

// 📧 Setup Nodemailer
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

// 🗑️ Request Account Deletion (Step 1)
router.post("/delete-account", async (req, res) => {
    try {
        const { email, username, reason } = req.body;
        if (!email || !username || !reason) {
            return res.status(400).json({ error: "❌ All fields are required." });
        }

        // 🔍 Check if user exists in the database
        const userResult = await pool.query("SELECT * FROM users WHERE email = $1 AND username = $2", [email, username]);
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "❌ Account not found." });
        }

        const user = userResult.rows[0];

        // 🔍 Check if the user has exceeded the deletion limit
        const deleteCountResult = await pool.query("SELECT delete_count FROM deletion_requests WHERE user_id = $1", [user.id]);
        let deleteCount = deleteCountResult.rows[0]?.delete_count || 0;
        if (deleteCount >= 5) {
            return res.status(403).json({ error: "🚫 Account permanently banned due to excessive deletions." });
        }

        // 🔑 Generate a confirmation token
        const token = crypto.randomBytes(32).toString("hex");
        const expiration = new Date(Date.now() + 10 * 60 * 1000); // Token expires in 10 minutes

        // Save deletion request in the database
        await pool.query(`
            INSERT INTO deletion_requests (user_id, email, username, reason, token, expiration)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [user.id, email, username, reason, token, expiration]);

        // 📧 Send confirmation email
        const apiUrl = await getWorkingAPI(); // Dynamically get the API URL
        const confirmLink = `${apiUrl}/mx/confirm-delete?token=${token}&email=${encodeURIComponent(email)}`;
        
        const mailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: "Confirm Account Deletion",
            html: `<p>Hello <b>${username}</b>,</p>
                   <p>You requested to delete your account. Click the link below to confirm:</p>
                   <a href="${confirmLink}" style="color: red; font-weight: bold;">Confirm Deletion</a>
                   <p>If you did not request this, ignore this email.</p>`
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: "📧 Confirmation email sent. Check your inbox!" });

    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "⚠️ Internal server error. Try again." });
    }
});

// ✅ Confirm Account Deletion (Step 2)
router.get("/confirm-delete", async (req, res) => {
    try {
        const { token, email } = req.query;

        const requestDataResult = await pool.query("SELECT * FROM deletion_requests WHERE email = $1 AND token = $2", [email, token]);
        if (requestDataResult.rowCount === 0) {
            return res.status(400).send("❌ Invalid or expired request.");
        }

        const requestData = requestDataResult.rows[0];
        if (Date.now() > new Date(requestData.expiration).getTime()) {
            return res.status(400).send("❌ Token expired.");
        }

        // 🔍 Get user details
        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [requestData.user_id]);
        if (userResult.rowCount === 0) {
            return res.status(404).send("❌ User not found.");
        }

        const user = userResult.rows[0];

        // 📝 Update deletion count and delete user after confirmation
        await pool.query(`
            UPDATE deletion_requests SET confirmed = TRUE, delete_count = delete_count + 1 WHERE email = $1
        `, [email]);
        
        await pool.query(`
            UPDATE users SET is_deleting = TRUE WHERE id = $1
        `, [user.id]);        

        // 🗑️ Delete user after 12 hours
        setTimeout(async () => {
            await pool.query("DELETE FROM users WHERE id = $1", [user.id]);
            console.log(`🗑️ User ${user.id} permanently deleted.`);
        }, 12 * 60 * 60 * 1000); // 12 hours

        // 📧 Send final confirmation email
        const finalMailOptions = {
            from: process.env.SMTP_EMAIL,
            to: email,
            subject: "Account Deleted Successfully",
            html: `<p>Hello <b>${user.username}</b>,</p>
                   <p>Your account has been successfully deleted from our system.</p>`
        };

        await transporter.sendMail(finalMailOptions);
        res.redirect("https://mxgamecoder.lovestoblog.com/mxdelete.html");
    } catch (error) {
        console.error("❌ Deletion confirmation error:", error);
        res.status(500).send("⚠️ Internal server error.");
    }
});

module.exports = router;
