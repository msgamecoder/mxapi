//mxsocketStatus.js
const pool = require("../mxconfig/mxdatabase");

const connectedUsers = new Map();
const disconnectTimers = new Map(); // 🕒 Track pending disconnects

function handleStatus(socket, io) {
  socket.on("register", async (user_id) => {
    if (!user_id) return;

    try {
      const result = await pool.query("SELECT phone_number FROM users WHERE id = $1", [user_id]);
      const phone = result.rows[0]?.phone_number;
      if (!phone) return;

      // Cancel pending disconnect if reconnecting fast
      if (disconnectTimers.has(user_id.toString())) {
        clearTimeout(disconnectTimers.get(user_id.toString()));
        disconnectTimers.delete(user_id.toString());
      }

      connectedUsers.set(user_id.toString(), { socketId: socket.id, phone });
      console.log(`✅ Registered user: ${user_id} (${phone})`);

      io.emit("user_online_status", { phone, isOnline: true });
    } catch (err) {
      console.error("❌ Error registering user:", err.message);
    }
  });

  socket.on("check_online_status", (phone) => {
    if (!phone) return;
    let isOnline = false;

    for (const { phone: storedPhone } of connectedUsers.values()) {
      if (storedPhone === phone) {
        isOnline = true;
        break;
      }
    }

    socket.emit("user_online_status", { phone, isOnline });
  });

  socket.on("disconnect", () => {
    for (const [user_id, data] of connectedUsers.entries()) {
      if (data.socketId === socket.id) {
        // Delay marking offline
        const timer = setTimeout(() => {
          connectedUsers.delete(user_id);
          io.emit("user_online_status", { phone: data.phone, isOnline: false });
          console.log(`🔌 Disconnected (after delay): ${user_id} (${data.phone})`);
          disconnectTimers.delete(user_id); // Clean up
        }, 10000); // 10 seconds grace period

        disconnectTimers.set(user_id, timer);
        break;
      }
    }
  });
}

module.exports = handleStatus;
