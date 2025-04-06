const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

// 📂 Folders for storing deletion requests & deleted users
const deleteRequestsFolder = path.join(__dirname, "../mxdelete_requests");
const deletedUsersFolder = path.join(__dirname, "../mxdeleted_users");

// Ensure directories exist
if (!fs.existsSync(deleteRequestsFolder)) fs.mkdirSync(deleteRequestsFolder, { recursive: true });
if (!fs.existsSync(deletedUsersFolder)) fs.mkdirSync(deletedUsersFolder, { recursive: true });

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

        // 🔍 Check if the user has deleted their account before
        const userFile = path.join(deletedUsersFolder, `${email}.json`);
        let deleteCount = 0;

        if (fs.existsSync(userFile)) {
            const userData = JSON.parse(fs.readFileSync(userFile, "utf8"));
            deleteCount = userData.deleteCount || 0;

            // 🚫 Ban user if they deleted their account 5 times
            if (deleteCount >= 5) {
                return res.status(403).json({ error: "🚫 Account permanently banned due to excessive deletions." });
            }
        }

        // 🔑 Generate a confirmation token
        const token = crypto.randomBytes(32).toString("hex");
        const expiration = Date.now() + 10 * 60 * 1000; // Token expires in 10 minutes

        // Save deletion request
        const requestData = { email, username, reason, token, expiration, userId: user.id };
        fs.writeFileSync(path.join(deleteRequestsFolder, `${email}.json`), JSON.stringify(requestData, null, 2));

        // 📧 Send confirmation email
        const confirmLink = `https://mxapi.onrender.com/mx/confirm-delete?token=${token}&email=${encodeURIComponent(email)}`;
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
        console.error("❌ Email sending error:", error);
        res.status(500).json({ error: "⚠️ Internal server error. Try again." });
    }
});

// ✅ Confirm Account Deletion (Step 2)
router.get("/confirm-delete", async (req, res) => {
    try {
        const { token, email } = req.query;
        const filePath = path.join(deleteRequestsFolder, `${email}.json`);

        if (!fs.existsSync(filePath)) {
            return res.status(400).send("❌ Invalid or expired request.");
        }

        // Load stored data
        const requestData = JSON.parse(fs.readFileSync(filePath, "utf8"));

        if (requestData.token !== token || Date.now() > requestData.expiration) {
            return res.status(400).send("❌ Token expired or invalid.");
        }

        const userId = requestData.userId;

        // 🔍 Get full user details before deletion
        const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
        if (userResult.rowCount === 0) {
            return res.status(404).send("❌ User not found.");
        }
        const user = userResult.rows[0];

        // 📝 Store full deleted user info
        const deletedData = {
            ...user,
            reason: requestData.reason,
            deletedAt: new Date().toISOString(),
            deleteCount: (fs.existsSync(path.join(deletedUsersFolder, `${email}.json`))) 
                ? JSON.parse(fs.readFileSync(path.join(deletedUsersFolder, `${email}.json`), "utf8")).deleteCount + 1 
                : 1
        };

        fs.writeFileSync(path.join(deletedUsersFolder, `${email}.json`), JSON.stringify(deletedData, null, 2));

        // ⏳ Schedule permanent deletion (12 hours)
        setTimeout(async () => {
            try {
                await pool.query("DELETE FROM users WHERE id = $1", [userId]);
                console.log(`🗑️ User ${userId} permanently deleted.`);

                // 📧 Send final deletion email
                const finalMailOptions = {
                    from: process.env.SMTP_EMAIL,
                    to: email,
                    subject: "Account Deleted Successfully",
                    html: `<p>Hello <b>${user.username}</b>,</p>
                           <p>Your account has been successfully deleted from our system.</p>
                           <p>If you ever want to come back, you can create a new account anytime.</p>
                           <p>Thank you for being with us.</p>`
                };

                await transporter.sendMail(finalMailOptions);
                console.log("📧 Final deletion email sent.");

            } catch (err) {
                console.error("❌ Error deleting user from DB:", err.message);
            }
        }, 12 * 60 * 60 * 1000); // 12 hours

        // Remove pending request file
        fs.unlinkSync(filePath);

        res.send("✅ Account deletion confirmed! Your account will be deleted in 12 hours.");

    } catch (error) {
        console.error("❌ Deletion confirmation error:", error);
        res.status(500).send("⚠️ Internal server error.");
    }
});

module.exports = router;
