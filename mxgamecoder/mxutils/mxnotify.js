const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: "../.env" });
const sanitizeFilename = require("sanitize-filename");

const NOTIFICATION_DIR = path.join(__dirname, "../mxgamecodernot");

// 🔥 Ensure the main notification folder exists
if (!fs.existsSync(NOTIFICATION_DIR)) {
  fs.mkdirSync(NOTIFICATION_DIR, { recursive: true });
}

// 🛑 Prevent email spam (2-minute cooldown per user)
const emailCooldown = new Map();

// Route to send email notifications and log them
router.post("/send-notification", async (req, res) => {
  const { userEmail, subject, message, username } = req.body;

  try {
    const now = Date.now();
    if (emailCooldown.has(userEmail)) {
      const lastSent = emailCooldown.get(userEmail);
      if (now - lastSent < 1 * 60 * 1000) {
        console.log("⏳ Email not sent (cooldown active)");
        return res.status(400).json({ message: "Cooldown active, try again later." });
      }
    }
    emailCooldown.set(userEmail, now);

    // 🔥 Sanitize username
    if (!username) {
      return res.status(400).json({ message: "Username is required." });
    }
    const safeUsername = sanitizeFilename(username);
    const userFolder = path.join(NOTIFICATION_DIR, safeUsername);

    // 🔥 Create user folder if it doesn't exist
    if (!fs.existsSync(userFolder)) {
      fs.mkdirSync(userFolder, { recursive: true });
    }

    // 🔥 Save notification log with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const logFile = path.join(userFolder, `${timestamp}.txt`);
    const logMessage = `📩 Email sent to: ${userEmail}\nSubject: ${subject}\nMessage: ${message}\nTime: ${new Date().toLocaleString()}\n\n`;

    fs.appendFileSync(logFile, logMessage);
    console.log(`📄 Notification saved: ${logFile}`);

    // 🔥 Secure Email Setup (Avoid Spam)
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
      secure: true, // 🔥 Forces SSL/TLS for better security
      tls: {
        rejectUnauthorized: false, // 🔥 Prevents TLS issues (use only if needed)
      },
    });

    // 🔥 Email options with proper headers
    let mailOptions = {
      from: `"MSWORLD Support" <${process.env.SMTP_EMAIL}>`,
      replyTo: process.env.SMTP_REPLYTO || process.env.SMTP_EMAIL,
      to: userEmail,
      subject: subject,
      html: `<div style="font-family: Arial, sans-serif; padding: 10px; background: #f4f4f4; border-radius: 5px;">
               <h2 style="color: #333;">${subject}</h2>
               <p style="color: #555;">${message}</p>
               <hr>
               <small style="color: #888;">If you didn't request this, you can ignore this email.</small>
             </div>`,
      headers: {
        "X-Priority": "1 (Highest)",
        "X-MSMail-Priority": "High",
        "Importance": "High",
        "List-Unsubscribe": `<mailto:${process.env.SMTP_EMAIL}?subject=unsubscribe>`,
      },
    };

    // 🔥 Send email
    await transporter.sendMail(mailOptions);
    console.log(`📩 Email sent to ${userEmail}: ${subject}`);
    res.status(200).json({ message: "Notification sent successfully." });

  } catch (error) {
    console.error("❌ Email notification error:", error);
    res.status(500).json({ message: "Error sending notification." });
  }
});

// Endpoint for frontend to receive notifications (for example, show in UI)
// Endpoint for frontend to receive notifications with full content
router.get("/notifications/:username", (req, res) => {
  const { username } = req.params;
  const safeUsername = sanitizeFilename(username);
  const userFolder = path.join(NOTIFICATION_DIR, safeUsername);

  if (!fs.existsSync(userFolder)) {
    return res.status(404).json({ message: "No notifications found for this user." });
  }

  // 🔥 Read all notification files
  const notificationFiles = fs.readdirSync(userFolder);

  const notifications = notificationFiles.map((file) => {
    const filePath = path.join(userFolder, file);
    const content = fs.readFileSync(filePath, "utf-8");

    const subjectMatch = content.match(/Subject:\s*(.+)/);
    const messageMatch = content.match(/Message:\s*(.+)/);
    const timeMatch = content.match(/Time:\s*(.+)/);

    return {
      filename: file,
      title: subjectMatch ? subjectMatch[1] : "No Subject",
      message: messageMatch ? messageMatch[1] : "No Message",
      time: timeMatch ? timeMatch[1] : "No Time",
    };
  });

  // Optional: sort by newest first
  notifications.sort((a, b) => new Date(b.time) - new Date(a.time));

  res.status(200).json({ notifications });
});


module.exports = router;
