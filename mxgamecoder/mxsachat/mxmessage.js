const pool = require("../mxconfig/mxdatabase");

async function socketMessageHandler(io) {
    io.on("connection", (socket) => {
        console.log("🟢 New user connected:", socket.id);

        // Join room
        socket.on("join_room", ({ room_id }) => {
            socket.join(room_id);
            console.log(`👤 Joined room: ${room_id}`);
        });

        // Send message
        socket.on("send_message", async (data) => {
            const { room_id, sender_id, receiver_id, content } = data;
            if (!room_id || !sender_id || !receiver_id || !content) return;

            try {
                // Save to DB
             await pool.query(
  "INSERT INTO messages (room_id, sender_id, receiver_id, content) VALUES ($1, $2, $3, $4)",
  [room_id, sender_id, receiver_id, content]
);

                // Broadcast to room
                io.to(room_id).emit("receive_message", {
                    sender_id,
                    content,
                    room_id,
                    timestamp: new Date().toISOString()
                });
            } catch (err) {
                console.error("❌ Message insert error:", err.message);
            }
        });

        socket.on("disconnect", () => {
            console.log("🔴 User disconnected:", socket.id);
        });

        // Load previous messages
socket.on("load_messages", async ({ room_id }) => {
    try {
        const result = await pool.query(
            "SELECT * FROM messages WHERE room_id = $1 ORDER BY timestamp ASC",
            [room_id]
        );
        // Send messages only to the requesting socket
        socket.emit("load_messages_result", result.rows);
    } catch (err) {
        console.error("❌ Load messages error:", err.message);
        socket.emit("load_messages_result", []);
    }
});

socket.on("typing", ({ room_id, sender_id }) => {
  socket.to(room_id).emit("user_typing", { sender_id });
});

socket.on("stop_typing", ({ room_id, sender_id }) => {
  socket.to(room_id).emit("user_stop_typing", { sender_id });
});

    });
}

module.exports = socketMessageHandler; 