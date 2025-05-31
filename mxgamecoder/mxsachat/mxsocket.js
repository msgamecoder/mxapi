//mxsocket
const { saveMessage, loadMessages } = require("./mxsocketMessages");
const { handleTyping, handleStopTyping } = require("./mxsocketTyping");
const handleStatus = require("./mxsocketStatus"); // 👈 Add this

function socketHandler(io) {
  io.on("connection", (socket) => {
    console.log("🟢 New user connected:", socket.id);

    socket.on("join_room", ({ room_id }) => {
      socket.join(room_id);
      console.log(`👤 Joined room: ${room_id}`);
    });

    socket.on("send_message", (data) => {
      saveMessage(data, io);
    });

    socket.on("load_messages", ({ room_id }) => {
      loadMessages(socket, room_id);
    });

    socket.on("typing", ({ room_id, sender_id }) => {
      handleTyping(socket, room_id, sender_id);
    });

    socket.on("stop_typing", ({ room_id, sender_id }) => {
      handleStopTyping(socket, room_id, sender_id);
    });

    // 🟡 Handle online/offline
    handleStatus(socket, io);

    socket.on("disconnect", () => {
      console.log("🔴 User disconnected:", socket.id);
    });
  });
}

module.exports = socketHandler;