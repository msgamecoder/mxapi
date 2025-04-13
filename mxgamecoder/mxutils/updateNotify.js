const express = require("express");
const router = express.Router();
const { sendEmailNotification } = require("./mxnotify");
const pool = require('../mxconfig/mxdatabase');

router.post("/notify-users-update", async (req, res) => {
  try {
    const { title, message } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    const subject = `📢 New MSWORLD Update: ${title}`;
    const emailMessage = `${message}<br><br><a href="https://mxgamecoder.lovestoblog.com/mxupdate.html" style="color: #007BFF;">Click here to view it</a>`;

    const usersQuery = await pool.query("SELECT username, email, id FROM users");
    const users = usersQuery.rows;

    for (const user of users) {
      await sendEmailNotification(user.email, subject, emailMessage, user.username, user.id);
    }

    res.status(200).json({ message: "✅ Notifications sent to all users." });
  } catch (error) {
    console.error("❌ Error notifying users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
