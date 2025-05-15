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

// SEND MESSAGE (real-time enabled)
router.post("/sachat/send-message", authMiddleware, async (req, res) => {
  const senderId = req.user.id;
  const { to, message } = req.body;

  if (!to || !message) return res.status(400).json({ error: "Missing recipient or message text" });

  try {
    const recipientQuery = await pool.query(
      "SELECT id FROM users WHERE phone_number = $1",
      [to]
    );

    if (recipientQuery.rows.length === 0) {
      return res.status(404).json({ error: "Recipient not found" });
    }

    const recipientId = recipientQuery.rows[0].id;

    const result = await pool.query(
      `INSERT INTO sachat_messages (sender_id, recipient_id, message_text, timestamp, status)
       VALUES ($1, $2, $3, NOW(), 'pending') -- Initially set status to 'pending'
       RETURNING *`,
      [senderId, recipientId, message]
    );

    const savedMessage = result.rows[0];

    // Send real-time message using Socket.IO
    const io = req.app.get("io");
    const connectedUsers = req.app.get("connectedUsers");

    const recipientSocketId = connectedUsers.get(recipientId.toString());
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("receive_message", {
        from: senderId,
        text: message,
        timestamp: savedMessage.timestamp || new Date().toISOString(),
        status: 'delivered' // Change to delivered status
      });
      // Update message status to 'delivered' in DB
      await pool.query(
        "UPDATE sachat_messages SET status = 'delivered' WHERE id = $1",
        [savedMessage.id]
      );
    }

    res.json({ success: true, message: "📤 Message sent", messageData: savedMessage });
  } catch (err) {
    console.error("Send message error:", err.message);
    res.status(500).json({ error: "Something went wrong sending the message" });
  }
});

// MARK AS SEEN
router.post("/sachat/mark-seen", authMiddleware, async (req, res) => {
  let messageIds = req.body.messageId;
  if (!messageIds) return res.status(400).json({ error: "Missing messageId" });

  // Normalize to array if single id passed
  if (!Array.isArray(messageIds)) {
    messageIds = [messageIds];
  }

  const userId = req.user.id;
  const io = req.app.get("io");
  const connectedUsers = req.app.get("connectedUsers");

  try {
    const result = await pool.query(
      `UPDATE sachat_messages 
       SET status = 'seen' 
       WHERE id = ANY($1) AND recipient_id = $2
       RETURNING *`,
      [messageIds, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No messages updated or not authorized" });
    }

    // Emit socket event to notify senders that their messages are seen
    result.rows.forEach(row => {
      const senderSocketId = connectedUsers.get(row.sender_id.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("message_seen", {
          messageId: row.id,
          status: "seen",
        });
      }
    });

    res.json({ success: true, updatedCount: result.rows.length });
  } catch (err) {
    console.error("Mark as seen error:", err.message);
    res.status(500).json({ error: "Internal server error" });
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
  `SELECT id, sender_id, recipient_id, message_text, timestamp, status
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

router.get("/sachat/chat-contacts", authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const query = `
    WITH all_chats AS (
      SELECT 
        CASE 
          WHEN sender_id = $1 THEN recipient_id
          ELSE sender_id
        END AS contact_id,
        MAX(timestamp) AS last_message_time
      FROM sachat_messages
      WHERE sender_id = $1 OR recipient_id = $1
      GROUP BY contact_id
    ),
    last_msgs AS (
      SELECT m.*
      FROM sachat_messages m
      INNER JOIN all_chats ac ON (
        (m.sender_id = $1 AND m.recipient_id = ac.contact_id)
        OR (m.sender_id = ac.contact_id AND m.recipient_id = $1)
      )
      AND m.timestamp = ac.last_message_time
    ),
    unread_counts AS (
      SELECT sender_id AS contact_id, COUNT(*) AS unread_count
      FROM sachat_messages
      WHERE recipient_id = $1 AND status != 'seen'
      GROUP BY sender_id
    )
    SELECT 
      ac.contact_id,
      COALESCE(c.name, u.full_name) AS name,
      u.profile_picture AS img,
      u.phone_number AS phone,
      lm.message_text AS "lastMessage",
      lm.timestamp AS "lastMessageTime",
      COALESCE(uc.unread_count, 0) AS unreadCount,
      lm.sender_id AS lastMessageSender
    FROM all_chats ac
    JOIN users u ON u.id = ac.contact_id
    LEFT JOIN sachat_contacts c ON c.owner_id = $1 AND c.contact_id = ac.contact_id
    JOIN last_msgs lm ON 
      (lm.sender_id = ac.contact_id AND lm.recipient_id = $1)
      OR (lm.sender_id = $1 AND lm.recipient_id = ac.contact_id)
    LEFT JOIN unread_counts uc ON uc.contact_id = ac.contact_id
    ORDER BY lm.timestamp DESC;
    `;

    const { rows } = await pool.query(query, [userId]);

    // Now add online status using connectedUsers map
    const connectedUsers = req.app.get("connectedUsers");

    // Map over rows and add isOnline property based on contact_id presence in connectedUsers
    const contactsWithStatus = rows.map((contact) => {
      return {
        ...contact,
        isOnline: connectedUsers.has(contact.contact_id.toString())
      };
    });

    res.json({ success: true, contacts: contactsWithStatus });
  } catch (err) {
    console.error("Get chat contacts error:", err.message);
    res.status(500).json({ error: "Something went wrong fetching chat contacts" });
  }
});

module.exports = router;
