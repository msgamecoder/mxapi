const express = require("express");
const fs = require("fs");
const path = require("path");
const sanitizeFilename = require("sanitize-filename");
const { sendEmailNotification } = require("./mxnotify");
const { db, collection } = require("./mxfirebase-config");
const { getDocs } = require("firebase/firestore");

const router = express.Router();
const NOTIFICATION_DIR = path.join(__dirname, "../mxgamecodernot");

// Get user notification file
function getUserNotificationFile(username) {
  const safeUsername = sanitizeFilename(username);
  const userFile = path.join(NOTIFICATION_DIR, `${safeUsername}_notifications.json`);

  console.log(`Getting notification file for user: ${username}`);
  if (!fs.existsSync(userFile)) {
    console.log(`File not found. Creating new file for user: ${username}`);
    fs.writeFileSync(userFile, JSON.stringify({ notifications: [] }));
  }

  return userFile;
}

function updateUserNotifications(username, updatedNotifications) {
  const safeUsername = sanitizeFilename(username);
  const userFile = path.join(NOTIFICATION_DIR, `${safeUsername}_notifications.json`);
  fs.writeFileSync(userFile, JSON.stringify({ notifications: updatedNotifications }, null, 2));
}

// Get notifications from Firebase for a user
async function getNotificationsFromFirebase(username) {
  console.log(`Fetching notifications from Firebase for user: ${username}`);
  const notificationsSnapshot = await getDocs(collection(db, "notifications"));
  const notifications = notificationsSnapshot.docs
    .map(doc => doc.data())
    .filter(notification => notification.username === username);

  console.log(`Notifications fetched from Firebase: ${notifications.length}`);
  return notifications;
}

// ✅ GET ALL NOTIFICATIONS (no duplicates)
router.get("/:username", async (req, res) => {
  const { username } = req.params;

  console.log(`Received request for notifications of user: ${username}`);
  try {
    const fileNotifications = JSON.parse(fs.readFileSync(getUserNotificationFile(username), 'utf-8')).notifications;
    console.log(`Notifications from file: ${fileNotifications.length}`);

    const firebaseNotifications = await getNotificationsFromFirebase(username);
    console.log(`Notifications from Firebase: ${firebaseNotifications.length}`);

    // Merge and remove duplicates by filename or id
    const combinedMap = new Map();
    [...fileNotifications, ...firebaseNotifications].forEach(notif => {
      const key = notif.filename || notif.id || JSON.stringify(notif);
      if (!combinedMap.has(key)) {
        combinedMap.set(key, notif);
      }
    });

    const allNotifications = Array.from(combinedMap.values())
      .sort((a, b) => new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt));

    console.log(`Total notifications combined: ${allNotifications.length}`);
    res.status(200).json({ notifications: allNotifications });
  } catch (err) {
    console.error("❌ Error reading notifications:", err);
    res.status(500).json({ message: "Failed to retrieve notifications." });
  }
});

// ✅ Mark one notification as read
router.put("/read/:username", (req, res) => {
  const { username } = req.params;
  const { filename } = req.body;

  console.log(`Marking notification as read for user: ${username}, filename: ${filename}`);
  const userFile = getUserNotificationFile(username);

  try {
    const data = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    const index = data.notifications.findIndex(n => n.filename === filename);

    if (index === -1) {
      console.log(`Notification with filename ${filename} not found.`);
      return res.status(404).json({ message: "Notification not found." });
    }

    data.notifications[index].read = true;

    console.log(`Notification ${filename} marked as read.`);
    updateUserNotifications(username, data.notifications);
    res.status(200).json({ message: `Notification ${filename} marked as read.` });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ message: "Failed to update notification." });
  }
});

module.exports = router;
