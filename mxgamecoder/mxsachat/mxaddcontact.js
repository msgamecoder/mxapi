const express = require("express");
const router = express.Router();
const pool = require("../mxconfig/mxdatabase");
const authMiddleware = require("../mxmiddleware/authMiddleware");

// ADD CONTACT WITH FALLBACK TO FULL NAME
router.post("/sachat/add-contact", authMiddleware, async (req, res) => {
  const { phone, sachat_id, name } = req.body;
  const ownerId = req.user.id;

  if (!phone && !sachat_id) {
    return res.status(400).json({ error: "Phone or SaChat ID required" });
  }

  try {
    let contactQuery;
    if (phone) {
      contactQuery = await pool.query(
        "SELECT id, full_name FROM users WHERE phone_number = $1",
        [phone]
      );
    } else {
      contactQuery = await pool.query(
        `SELECT u.id, u.full_name 
         FROM sachat_users s
         JOIN users u ON s.user_id = u.id
         WHERE s.sachat_id = $1`,
        [sachat_id]
      );
    }

    if (contactQuery.rows.length === 0) {
      return res.json({
        found: false,
        message: "😕 Contact not found. They haven't joined SaChat yet."
      });
    }

    const contact = contactQuery.rows[0];
    const contactId = contact.id;
    const fallbackName = contact.full_name || "Unknown"; // use full_name, NOT username
    const displayName = name && name.trim() !== "" ? name : fallbackName;

    // Check if contact exists already
    const existing = await pool.query(
      "SELECT * FROM sachat_contacts WHERE owner_id = $1 AND contact_id = $2",
      [ownerId, contactId]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        "UPDATE sachat_contacts SET name = $1 WHERE owner_id = $2 AND contact_id = $3",
        [displayName, ownerId, contactId]
      );
      return res.json({
        success: true,
        message: "✅ Contact name updated successfully!"
      });
    }

    await pool.query(
      `INSERT INTO sachat_contacts (owner_id, contact_id, name)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [ownerId, contactId, displayName]
    );

    res.json({ success: true, message: "✅ Contact added successfully!" });
  } catch (err) {
    console.error("Add contact error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET CONTACTS — fallback to full_name, not username
router.get("/sachat/get-contacts", authMiddleware, async (req, res) => {
  const ownerId = req.user.id;

  try {
    const contacts = await pool.query(
      `
      SELECT 
        COALESCE(c.name, u.full_name) AS name, 
        u.phone_number, 
        s.sachat_id 
      FROM sachat_contacts c
      JOIN users u ON c.contact_id = u.id
      LEFT JOIN sachat_users s ON s.user_id = u.id
      WHERE c.owner_id = $1
      ORDER BY name ASC
      `,
      [ownerId]
    );

    res.json({ success: true, contacts: contacts.rows });
  } catch (err) {
    console.error("Get contacts error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
