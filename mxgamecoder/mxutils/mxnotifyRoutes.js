const express = require("express");
const fs = require("fs");
const path = require("path");
const sanitizeFilename = require("sanitize-filename");
const { sendEmailNotification } = require("./mxnotify");
const { db, collection } = require("./mxfirebase-config");
const { getDocs } = require("firebase/firestore");
const pool = require("../mxconfig/mxdatabase"); // ✅ PostgreSQL DB

const router = express.Router();
const NOTIFICATION_DIR = path.join(__dirname, "../mxgamecodernot");

// Get notification JSON file path
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
  const safeUsername = sanitizeFilename(username);
  const userFile = path.join(NOTIFICATION_DIR, `${safeUsername}_notifications.json`);
  fs.writeFileSync(userFile, JSON.stringify({ notifications: updatedNotifications }, null, 2));
}

// Fetch notifications from Firebase
async function getNotificationsFromFirebase(username) {
  const snapshot = await getDocs(collection(db, "notifications"));
  return snapshot.docs
    .map(doc => doc.data())
    .filter(n => n.username === username);
}

// ✅ Admin: Get all users
router.get("/users/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT username, email, location, bio, phone_number FROM users");
    res.status(200).json({
      totalUsers: result.rowCount,
      users: result.rows
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users." });
  }
});

// ✅ Get all notifications (merged + deduped)
router.get("/:username", async (req, res) => {
  const { username } = req.params;
  try {
    const fileNotifications = JSON.parse(fs.readFileSync(getUserNotificationFile(username), 'utf-8')).notifications;
    const firebaseNotifications = await getNotificationsFromFirebase(username);

    const combinedMap = new Map();
    [...fileNotifications, ...firebaseNotifications].forEach(notif => {
      const key = notif.filename || notif.id || JSON.stringify(notif);
      if (!combinedMap.has(key)) {
        combinedMap.set(key, notif);
      }
    });

    const allNotifications = Array.from(combinedMap.values()).sort((a, b) =>
      new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt)
    );

    res.status(200).json({ notifications: allNotifications });
  } catch (err) {
    console.error("❌ Error reading notifications:", err);
    res.status(500).json({ message: "Failed to retrieve notifications." });
  }
});

// ✅ Mark one as read
router.put("/read/:username", (req, res) => {
  const { username } = req.params;
  const { filename } = req.body;
  const userFile = getUserNotificationFile(username);

  try {
    const data = JSON.parse(fs.readFileSync(userFile, 'utf-8'));
    const index = data.notifications.findIndex(n => n.filename === filename);

    if (index === -1) {
      return res.status(404).json({ message: "Notification not found." });
    }

    data.notifications[index].read = true;
    updateUserNotifications(username, data.notifications);
    res.status(200).json({ message: `Notification ${filename} marked as read.` });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ message: "Failed to update notification." });
  }
});

// ✅ Get single notification content
router.get("/:username/:filename", (req, res) => {
  const { username, filename } = req.params;
  const userFile = getUserNotificationFile(username);

  try {
    const data = JSON.parse(fs.readFileSync(userFile, "utf-8"));
    const notification = data.notifications.find(n => n.filename === filename);

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
