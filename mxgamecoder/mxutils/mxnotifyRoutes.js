const express = require("express");
const fs = require("fs");
const path = require("path");
const sanitizeFilename = require("sanitize-filename");
const { sendEmailNotification } = require("../mxutils/mxnotify");

const router = express.Router();
const NOTIFICATION_DIR = path.join(__dirname, "../mxgamecodernot");
// const USER_NOTIFICATION_JSON = path.join(__dirname, "../mxgamecodernot/notifications.json");

// Get user notification file
function getUserNotificationFile(username) {
  const safeUsername = sanitizeFilename(username);
  const userFile = path.join(NOTIFICATION_DIR, `${safeUsername}_notifications.json`);

  if (!fs.existsSync(userFile)) {
    fs.writeFileSync(userFile, JSON.stringify({ notifications: [] }));
  }

  return userFile;
}

// Update user notifications
function updateUserNotifications(username, updatedNotifications) {
  const userFile = getUserNotificationFile(username);
  fs.writeFileSync(userFile, JSON.stringify({ notifications: updatedNotifications }));
}

// ✅ Send notification (optional email)
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

// ✅ GET ALL NOTIFICATIONS (not just unread)
router.get("/:username", (req, res) => {
  const { username } = req.params;
  const userFile = getUserNotificationFile(username);

  try {
    const data = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    const allNotifications = data.notifications;

    allNotifications.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.status(200).json({ notifications: allNotifications });
  } catch (err) {
    console.error("❌ Error reading notifications file:", err);
    res.status(500).json({ message: "Failed to retrieve notifications." });
  }
});

// ✅ Mark one notification as read
router.put("/read/:username", (req, res) => {
  const { username } = req.params;
  const { filename } = req.body;

  const userFile = getUserNotificationFile(username);

  try {
    const data = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    const index = data.notifications.findIndex(n => n.filename === filename);

    if (index === -1) return res.status(404).json({ message: "Notification not found." });

    data.notifications[index].read = true;

    updateUserNotifications(username, data.notifications);
    res.status(200).json({ message: `Notification ${filename} marked as read.` });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ message: "Failed to update notification." });
  }
});

router.get("/:username/:filename", async (req, res) => {
  const { username, filename } = req.params;
  
  const userFile = getUserNotificationFile(username);

  try {
    const data = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    const notification = data.notifications.find(n => n.filename === filename);

    if (notification) {
      res.json({ notification });
    } else {
      res.status(404).json({ error: 'Notification not found' });
    }
  } catch (error) {
    console.error("❌ Error fetching notification:", error);
    res.status(500).json({ error: 'Server error' });
  }
});



module.exports = router;