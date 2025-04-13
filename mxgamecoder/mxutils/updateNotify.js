const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase');
const { sendEmailNotification } = require('./mxnotify'); // assuming it's in root

router.post('/notify-users-update', async (req, res) => {
  try {
    const { subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and message are required." });
    }

    // Get all users from DB
    const result = await pool.query('SELECT username, email, id FROM users');

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No users found." });
    }

    for (const user of result.rows) {
      const { username, email, id } = user;
      await sendEmailNotification(email, subject, message, username, id);
    }

    return res.status(200).json({ message: "Emails sent to all users!" });
  } catch (error) {
    console.error("Error sending update notification:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = router;
