// mxgamecoder/mxutils/mxnotifyRoutes.js

const express = require("express");
const fs = require("fs");
const path = require("path");
const sanitizeFilename = require("sanitize-filename");
const { sendEmailNotification } = require("../mxutils/mxnotify");

const router = express.Router();
const NOTIFICATION_DIR = path.join(__dirname, "../mxgamecodernot");

// Send a notification via email
router.post("/send", async (req, res) => {
  const { userEmail, subject, message, username } = req.body;

  if (!userEmail || !subject || !message || !username) {
    return res.status(400).json({ message: "Missing fields." });
  }

  try {
    await sendEmailNotification(userEmail, subject, message, username);
    res.status(200).json({ message: "Notification sent." });
  } catch (err) {
    console.error("❌ POST /send error:", err);
    res.status(500).json({ message: "Failed to send." });
  }
});

// Get notifications for a specific user
router.get("/:username", (req, res) => {
  const { username } = req.params;
  const safeUsername = sanitizeFilename(username);
  const userFolder = path.join(NOTIFICATION_DIR, safeUsername);

  if (!fs.existsSync(userFolder)) {
    return res.status(404).json({ message: "No notifications found." });
  }

  const files = fs.readdirSync(userFolder);
  const notifications = files.map((file) => {
    const content = fs.readFileSync(path.join(userFolder, file), "utf-8");
    const subject = content.match(/Subject:\s*(.+)/)?.[1] || "No Subject";
    const message = content.match(/Message:\s*(.+)/)?.[1] || "No Message";
    const time = content.match(/Time:\s*(.+)/)?.[1] || "No Time";

    return { filename: file, title: subject, message, time };
  });

  notifications.sort((a, b) => new Date(b.time) - new Date(a.time));
  res.status(200).json({ notifications });
});

// Mark notifications as read
router.put("/read/:username", (req, res) => { // Fixed: Removed the extra /notifications part
  const { username } = req.params;
  const safeUsername = sanitizeFilename(username);
  const userFolder = path.join(NOTIFICATION_DIR, safeUsername);

  if (!fs.existsSync(userFolder)) {
    return res.status(404).json({ message: "No notifications found." });
  }

  const files = fs.readdirSync(userFolder);
  const notifications = files.map((file) => {
    const content = fs.readFileSync(path.join(userFolder, file), "utf-8");
    const subject = content.match(/Subject:\s*(.+)/)?.[1] || "No Subject";
    const message = content.match(/Message:\s*(.+)/)?.[1] || "No Message";
    const time = content.match(/Time:\s*(.+)/)?.[1] || "No Time";

    return { filename: file, title: subject, message, time };
  });

  // Count unread notifications
  const unreadNotifications = notifications.filter((notification) => !notification.read);
  
  // Mark the notifications as read
  notifications.forEach((notification) => {
    const notificationFilePath = path.join(userFolder, notification.filename);
    const updatedContent = fs.readFileSync(notificationFilePath, "utf-8").replace(/(📩.*?)/g, "📩 Read");
    fs.writeFileSync(notificationFilePath, updatedContent); // Mark as read
  });

  // Send the count of unread notifications
  res.status(200).json({ message: "Notifications marked as read.", unreadCount: unreadNotifications.length });
});

module.exports = router;
