const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const authMiddleware = require("../mxmiddleware/authMiddleware");

// ADD NEW CONTACT
router.post("/sachat/add-contact", authMiddleware, async (req, res) => {
  const { phone, sachat_id, name } = req.body;
  const ownerId = req.user.id;

  if (!name) {
    return res.status(400).json({ error: "Name is required" });
  }

  if (!phone && !sachat_id) {
    return res.status(400).json({ error: "Phone or SaChat ID required" });
  }

  try {
    let contactQuery;
    if (phone) {
      contactQuery = await pool.query(
        "SELECT id FROM users WHERE phone_number = $1",
        [phone]
      );
    } else if (sachat_id) {
      contactQuery = await pool.query(
        "SELECT user_id FROM sachat_users WHERE sachat_id = $1",
        [sachat_id]
      );
    }

    if (contactQuery.rows.length === 0) {
      return res.json({
        found: false,
        message: "😕 Contact not found. They haven't joined SaChat yet."
      });
    }

    const contactId = contactQuery.rows[0].id || contactQuery.rows[0].user_id;

    // Check if the contact is already in the user's contact list
    const existingContact = await pool.query(
      "SELECT * FROM sachat_contacts WHERE owner_id = $1 AND contact_id = $2",
      [ownerId, contactId]
    );

    if (existingContact.rows.length > 0) {
      return res.status(400).json({
        error: "This contact is already added to your contact list."
      });
    }

    await pool.query(
      `
      INSERT INTO sachat_contacts (owner_id, contact_id, name)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `,
      [ownerId, contactId, name]
    );

    res.json({ success: true, message: "✅ Contact added successfully!" });
  } catch (err) {
    console.error("Add contact error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET SAVED CONTACTS
router.get("/sachat/get-contacts", authMiddleware, async (req, res) => {
  const ownerId = req.user.id;

  try {
    const contacts = await pool.query(
      `
      SELECT 
        c.name, 
        u.phone_number, 
        s.sachat_id 
      FROM sachat_contacts c
      JOIN users u ON c.contact_id = u.id
      LEFT JOIN sachat_users s ON s.user_id = u.id
      WHERE c.owner_id = $1
      ORDER BY c.name ASC
      `,
      [ownerId]
    );

    res.json({ success: true, contacts: contacts.rows });
  } catch (err) {
    console.error("Get contacts error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});


// SEND MESSAGE
router.post("/sachat/send-message", authMiddleware, async (req, res) => {
  const senderId = req.user.id;
  const { to, message } = req.body;

  if (!to || !message)
    return res.status(400).json({ error: "Missing recipient or message text" });

  try {
    const recipientQuery = await pool.query(
      "SELECT id FROM users WHERE phone_number = $1",
      [to]
    );

    if (recipientQuery.rows.length === 0) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const recipientId = recipientQuery.rows[0].id;

    await pool.query(
      `INSERT INTO sachat_messages (sender_id, recipient_id, message_text, timestamp)
       VALUES ($1, $2, $3, NOW())`,
      [senderId, recipientId, message]
    );

    res.json({ success: true, message: "📤 Message sent" });
  } catch (err) {
    console.error("Send message error:", err.message);
    res.status(500).json({ error: "Something went wrong sending the message" });
  }
});

// GET MESSAGE HISTORY WITH A CONTACT
router.get("/sachat/messages", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { with: contactPhone } = req.query;

  if (!contactPhone) return res.status(400).json({ error: "Contact phone is required" });

  try {
    const contactQuery = await pool.query(
      "SELECT id FROM users WHERE phone_number = $1",
      [contactPhone]
    );

    if (contactQuery.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const contactId = contactQuery.rows[0].id;

    const messages = await pool.query(
      `SELECT sender_id, recipient_id, message_text, timestamp
       FROM sachat_messages
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY timestamp ASC`,
      [userId, contactId]
    );

    res.json({ success: true, messages: messages.rows });
  } catch (err) {
    console.error("Fetch messages error:", err.message);
    res.status(500).json({ error: "Something went wrong fetching messages" });
  }
});

module.exports = router;
