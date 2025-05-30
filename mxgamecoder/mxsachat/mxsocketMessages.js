// mxsocketMessages.js
const pool = require("../mxconfig/mxdatabase");

async function saveMessage(data, io) {
  const { room_id, sender_id, receiver_id, content } = data;
  if (!room_id || !sender_id || !receiver_id || !content) return;

  try {
    await pool.query(
      "INSERT INTO messages (room_id, sender_id, receiver_id, content) VALUES ($1, $2, $3, $4)",
      [room_id, sender_id, receiver_id, content]
    );

    io.to(room_id).emit("receive_message", {
      sender_id,
      content,
      room_id,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ Message insert error:", err.message);
  }
}

async function loadMessages(socket, room_id) {
  try {
    const result = await pool.query(
      "SELECT * FROM messages WHERE room_id = $1 ORDER BY timestamp ASC",
      [room_id]
    );
    socket.emit("load_messages_result", result.rows);
  } catch (err) {
    console.error("❌ Load messages error:", err.message);
    socket.emit("load_messages_result", []);
  }
}

module.exports = {
  saveMessage,
  loadMessages,
};
