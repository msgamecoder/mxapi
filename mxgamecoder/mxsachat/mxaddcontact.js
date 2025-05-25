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
    const fallbackName = contact.full_name || "Unknown";
    const displayName = name && name.trim() !== "" ? name : fallbackName;

    // Check if contact already exists
    const existing = await pool.query(
      "SELECT * FROM sachat_contacts WHERE owner_id = $1 AND contact_id = $2",
      [ownerId, contactId]
    );

    if (existing.rows.length > 0) {
      // Always update name, even if it's the same
      await pool.query(
        "UPDATE sachat_contacts SET name = $1 WHERE owner_id = $2 AND contact_id = $3",
        [displayName, ownerId, contactId]
      );
      return res.json({
        success: true,
        message: "✅ Contact updated successfully!"
      });
    }

    // If not exists, insert new
    await pool.query(
      `INSERT INTO sachat_contacts (owner_id, contact_id, name)
       VALUES ($1, $2, $3)`,
      [ownerId, contactId, displayName]
    );

    res.json({ success: true, message: "✅ Contact added successfully!" });
  } catch (err) {
    console.error("Add contact error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET CONTACTS — fallback to full_name, username + include bio
router.get("/sachat/get-contacts", authMiddleware, async (req, res) => {
  const ownerId = req.user.id;

  try {
    const contacts = await pool.query(
      `
      SELECT 
        COALESCE(c.name, u.full_name) AS name, 
        u.phone_number, 
        s.sachat_id,
        u.profile_picture,
        u.username,
        CASE 
          WHEN u.id = $1 THEN '🪞 It you!'
          ELSE COALESCE(NULLIF(TRIM(u.bio), ''), '📭 No bio yet. Say hi and break the ice!')
        END AS bio
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

// Delete contacts
router.post("/sachat/delete-contacts", authMiddleware, async (req, res) => {
  const ownerId = req.user.id;
  const { contact_ids } = req.body;

  if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
    return res.status(400).json({ error: "No contact IDs provided" });
  }

  try {
    const phonePlaceholders = contact_ids.map((_, i) => `$${i + 1}`).join(",");
    const sachatPlaceholders = contact_ids.map((_, i) => `$${i + 1 + contact_ids.length}`).join(",");
    const values = [...contact_ids, ...contact_ids];

    const userQuery = await pool.query(
      `SELECT u.id FROM users u
       LEFT JOIN sachat_users s ON s.user_id = u.id
       WHERE u.phone_number IN (${phonePlaceholders})
          OR s.sachat_id IN (${sachatPlaceholders})`,
      values
    );

    if (userQuery.rows.length === 0) {
      return res.json({ success: false, message: "No matching contacts found." });
    }

    const userIds = userQuery.rows.map(r => r.id);

    try {
      const deletePlaceholders = userIds.map((_, i) => `$${i + 2}`).join(",");

      await pool.query(
        `DELETE FROM sachat_contacts
         WHERE owner_id = $1 AND contact_id IN (${deletePlaceholders})`,
        [ownerId, ...userIds]
      );

      res.json({ success: true, deleted: userIds.length });
    } catch (deleteErr) {
      console.error("Delete failed. Moving to temp_user_deleted_contacts:", deleteErr);

      // Move failed deletes to temp_user_deleted_contacts
      for (const id of userIds) {
        await pool.query(
          `INSERT INTO temp_user_deleted_contacts (owner_id, contact_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [ownerId, id]
        );
      }

      res.json({
        success: false,
        fallback: true,
        message: "Failed to delete. Moved to temporary storage."
      });
    }
  } catch (err) {
    console.error("Error in deletion:", err);
    res.status(500).json({ error: "Unexpected error during deletion." });
  }
});

module.exports = router;
