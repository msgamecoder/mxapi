const express = require("express");
const { sendEmailNotification } = require("./mxnotify");
const { db, collection } = require("./mxfirebase-config");
const { getDocs, doc, getDoc } = require("firebase/firestore");

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

// ✅ GET ALL NOTIFICATIONS (no duplicates)
router.get("/:username", async (req, res) => {
  const { username } = req.params;

  console.log(`Received request for notifications of user: ${username}`);
  try {
    const firebaseNotifications = await getNotificationsFromFirebase(username);
    console.log(`Notifications from Firebase: ${firebaseNotifications.length}`);

    // Sort notifications by time (most recent first)
    const allNotifications = firebaseNotifications.sort(
      (a, b) => new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt)
    );

    console.log(`Total notifications: ${allNotifications.length}`);
    res.status(200).json({ notifications: allNotifications });
  } catch (err) {
    console.error("❌ Error fetching notifications:", err);
    res.status(500).json({ message: "Failed to retrieve notifications." });
  }
});

// ✅ GET SPECIFIC NOTIFICATION FROM FIREBASE
router.get("/:username/:filename", async (req, res) => {
  const { username, filename } = req.params;

  console.log(`Fetching notification for user: ${username}, filename: ${filename}`);
  
  try {
    const notifRef = doc(db, "notifications", `${username}_${filename}`);
    const notifSnap = await getDoc(notifRef);

    if (notifSnap.exists()) {
      const notification = notifSnap.data();
      res.status(200).json({ notification });
    } else {
      res.status(404).json({ message: "Notification not found." });
    }
  } catch (err) {
    console.error("❌ Error fetching notification:", err);
    res.status(500).json({ message: "Failed to retrieve notification." });
  }
});

// ✅ MARK A NOTIFICATION AS READ (update in Firebase)
router.put("/read/:username", async (req, res) => {
  const { username } = req.params;
  const { filename } = req.body;

  console.log(`Marking notification as read for user: ${username}, filename: ${filename}`);
  
  try {
    const notifRef = doc(db, "notifications", `${username}_${filename}`);
    const notifSnap = await getDoc(notifRef);

    if (!notifSnap.exists()) {
      return res.status(404).json({ message: "Notification not found." });
    }

    const notifData = notifSnap.data();
    notifData.read = true;

    // Update notification in Firebase
    await notifRef.update({ read: true });

    console.log(`Notification ${filename} marked as read.`);
    res.status(200).json({ message: `Notification ${filename} marked as read.` });
  } catch (err) {
    console.error("❌ Error marking notification as read:", err);
    res.status(500).json({ message: "Failed to update notification." });
  }
});

module.exports = router;
