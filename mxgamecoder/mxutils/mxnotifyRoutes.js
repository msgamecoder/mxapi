const express = require("express");
const { sendEmailNotification } = require("./mxnotify");
const { db, collection } = require("./mxfirebase-config");
const { getDocs } = require("firebase/firestore");
const pool = require("../mxconfig/mxdatabase"); // ✅ Correct way!

const router = express.Router();

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

router.get("/users/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT username, email, location, bio, phone_number FROM users");
    
    res.status(200).json({
      totalUsers: result.rowCount, // Total number of users
      users: result.rows          // The list of users and their details
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users." });
  }
});

// ✅ GET ALL NOTIFICATIONS (no duplicates)
router.get("/:username", async (req, res) => {
  const { username } = req.params;

  console.log(`Received request for notifications of user: ${username}`);
  try {
    const firebaseNotifications = await getNotificationsFromFirebase(username);
    console.log(`Notifications from Firebase: ${firebaseNotifications.length}`);

    // Remove duplicates by filename or id
    const combinedMap = new Map();
    firebaseNotifications.forEach(notif => {
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
router.put("/read/:username", async (req, res) => {
  const { username } = req.params;
  const { filename } = req.body;

  console.log(`Marking notification as read for user: ${username}, filename: ${filename}`);
  try {
    const notificationsSnapshot = await getDocs(collection(db, "notifications"));
    const notifications = notificationsSnapshot.docs
      .map(doc => doc.data())
      .filter(notification => notification.username === username);

    const notification = notifications.find(n => n.filename === filename);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    notification.read = true;

    // Update notification status in Firebase
    await db.collection("notifications").doc(notification.id).update({ read: true });

    console.log(`Notification ${filename} marked as read.`);
    res.status(200).json({ message: `Notification ${filename} marked as read.` });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ message: "Failed to update notification." });
  }
});

module.exports = router;
