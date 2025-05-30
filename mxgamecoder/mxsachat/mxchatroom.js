const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const pool = require("../mxconfig/mxdatabase");
const authMiddleware = require("../mxmiddleware/authMiddleware");

router.post("/sachat/get-room", authMiddleware, async (req, res) => {
    try {
        const senderQuery = await pool.query(`
            SELECT phone_number FROM users 
            WHERE id = $1
        `, [req.user.id]);

        const receiverQuery = await pool.query(`
            SELECT phone_number FROM users 
            WHERE id::text = $1 OR phone_number = $1
        `, [String(req.body.target_id)]);

        const senderPhone = senderQuery.rows[0]?.phone_number;
        const receiverPhone = receiverQuery.rows[0]?.phone_number;

        if (!senderPhone || !receiverPhone) {
            return res.status(400).json({ success: false, error: "❌ Invalid user(s)" });
        }

        const [user1, user2] = [senderPhone, receiverPhone].sort();
        const roomKey = `${user1}__${user2}`;

        const checkQuery = `SELECT room_id FROM rooms WHERE room_key = $1 LIMIT 1`;
        const checkResult = await pool.query(checkQuery, [roomKey]);

        if (checkResult.rows.length > 0) {
            return res.json({ success: true, room_id: checkResult.rows[0].room_id });
        }

        const newRoomId = uuidv4();
        const insertQuery = `
            INSERT INTO rooms (room_id, user1, user2, room_key)
            VALUES ($1, $2, $3, $4)
        `;
        await pool.query(insertQuery, [newRoomId, user1, user2, roomKey]);

        res.json({ success: true, room_id: newRoomId });
    } catch (err) {
        console.error("Room creation error:", err.message);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
});

/*router.get('/messages/:room_id', authMiddleware, async (req, res) => {
  const { room_id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM messages WHERE room_id = $1 ORDER BY timestamp ASC",
      [room_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Fetch messages error:", err.message);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});
*/
module.exports = router;
