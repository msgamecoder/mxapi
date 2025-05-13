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
// GET SAVED CONTACTS WITH PROFILE PICTURE
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

    // Fetch profile pictures using each phone number
    const enrichedContacts = await Promise.all(
      contacts.rows.map(async (contact) => {
        let profile_picture = null;
        try {
          const apiUrl = process.env.FALLBACK_API_URL || "https://msworld.onrender.com"; // fallback
          const resp = await fetch(`${apiUrl}/mx/profile`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: contact.phone_number })
          });

          const profileData = await resp.json();
          if (profileData.success && profileData.profile_picture) {
            profile_picture = profileData.profile_picture;
          }
        } catch (err) {
          console.error("Profile fetch failed:", err.message);
        }

        return {
          name: contact.name,
          sachat_id: contact.sachat_id,
          profile_picture
        };
      })
    );

    res.json({ success: true, contacts: enrichedContacts });
  } catch (err) {
    console.error("Get contacts error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
