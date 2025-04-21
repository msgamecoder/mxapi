const express = require("express");
const fs = require("fs");
const path = require("path");
const sanitizeFilename = require("sanitize-filename");
const { sendEmailNotification } = require("./mxnotify");
const { db, collection } = require("./mxfirebase-config");
const { getDocs, doc, updateDoc } = require("firebase/firestore");
const pool = require("../mxconfig/mxdatabase"); // ✅ Correct way!

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

// ✅ Mark one notification as read (Updated to sync Firebase and JSON)
router.put("/read/:username", async (req, res) => {
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

    // Update the local JSON file
    data.notifications[index].read = true;
    updateUserNotifications(username, data.notifications);

    // Update the notification in Firebase to mark it as read
    const firebaseNotification = await getNotificationFromFirebase(username, filename);
    if (firebaseNotification) {
      await updateNotificationInFirebase(firebaseNotification.id, { read: true });
    }

    console.log(`Notification ${filename} marked as read.`);
    res.status(200).json({ message: `Notification ${filename} marked as read.` });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ message: "Failed to update notification." });
  }
});

// Helper function to fetch the notification from Firebase
async function getNotificationFromFirebase(username, filename) {
  const notificationsSnapshot = await getDocs(collection(db, "notifications"));
  const notifications = notificationsSnapshot.docs
    .map(doc => doc.data())
    .filter(notification => notification.username === username && notification.filename === filename);

  return notifications.length > 0 ? notifications[0] : null;
}

// Helper function to update the notification in Firebase
async function updateNotificationInFirebase(id, updatedData) {
  const notificationRef = doc(db, "notifications", id);
  await updateDoc(notificationRef, updatedData);
}

// Serve a specific notification file (assuming files are stored locally)
router.get("/:username/:filename", (req, res) => {
  const { username, filename } = req.params;

  console.log(`Fetching notification file for user: ${username}, filename: ${filename}`);
  const userFile = getUserNotificationFile(username); // Path to the user's notifications
  
  try {
    const data = JSON.parse(fs.readFileSync(userFile, "utf-8"));
    const notification = data.notifications.find((notif) => notif.filename === filename);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.status(200).json({ notification });
  } catch (err) {
    console.error("❌ Error reading notification file:", err);
    res.status(500).json({ message: "Failed to retrieve notification." });
  }
});

module.exports = router;
