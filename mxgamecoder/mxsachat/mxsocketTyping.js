// mxsocketTyping.js

function handleTyping(socket, room_id, sender_id) {
  socket.to(room_id).emit("user_typing", { sender_id });
}

function handleStopTyping(socket, room_id, sender_id) {
  socket.to(room_id).emit("user_stop_typing", { sender_id });
}

module.exports = {
  handleTyping,
  handleStopTyping,
};