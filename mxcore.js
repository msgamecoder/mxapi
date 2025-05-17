require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const pool = require('./mxgamecoder/mxconfig/mxdatabase');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Enable Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: ['http://127.0.0.1:5500', 'https://mxgamecoder.lovestoblog.com'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware setup
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'https://mxgamecoder.lovestoblog.com'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Track online users
const connectedUsers = new Map();
app.set("connectedUsers", connectedUsers);
app.set("io", io);

// Socket.IO logic
io.on("connection", (socket) => {
  console.log("🔌 New user connected:", socket.id);

socket.on("register", async (userId) => {
  if (!userId) return;

  try {
    const result = await pool.query("SELECT phone_number FROM users WHERE id = $1", [userId]);
    const phone = result.rows[0]?.phone_number;
    if (phone) {
      connectedUsers.set(userId.toString(), { socketId: socket.id, phone });
      console.log(`🟢 User ${userId} (${phone}) registered with socket ${socket.id}`);

      // Broadcast to all that this user is online
      io.emit("user_online_status", { phone, isOnline: true });
    }
  } catch (err) {
    console.error("Register error:", err);
  }
});

socket.on("check_online_status", (phone) => {
  if (!phone) return;

  let isOnline = false;
  for (let { phone: storedPhone } of connectedUsers.values()) {
    if (storedPhone === phone) {
      isOnline = true;
      break;
    }
  }

  socket.emit("user_online_status", { phone, isOnline });
});

socket.on("disconnect", () => {
  for (let [userId, userInfo] of connectedUsers.entries()) {
    if (userInfo.socketId === socket.id) {
      connectedUsers.delete(userId);
      console.log(`🔴 User ${userId} (${userInfo.phone}) disconnected`);

      // Broadcast offline status
      io.emit("user_online_status", { phone: userInfo.phone, isOnline: false });

      break;
    }
  }
});

socket.on("reconnect", (attempt) => {
  console.log(`🔄 Reconnected after ${attempt} attempts`);
  socket.emit("register", userId); // re-register after reconnect
  socket.emit("check_online_status", target.phone);
});

// 🔤 Typing indicators
socket.on("typing", ({ fromId, toPhone }) => {
  if (!fromId || !toPhone) return;

  const fromUser = connectedUsers.get(fromId.toString());
  if (!fromUser) return;

  for (let [id, { phone, socketId }] of connectedUsers.entries()) {
    if (phone === toPhone) {
      io.to(socketId).emit("show_typing", { phone: fromUser.phone });
      break;
    }
  }
});

socket.on("stop_typing", ({ fromId, toPhone }) => {
  if (!fromId || !toPhone) return;

  const fromUser = connectedUsers.get(fromId.toString());
  if (!fromUser) return;

  for (let [id, { phone, socketId }] of connectedUsers.entries()) {
    if (phone === toPhone) {
      io.to(socketId).emit("hide_typing", { phone: fromUser.phone });
      break;
    }
  }
});

});

// Basic health check route
app.get('/', (req, res) => res.send('🔥 MXWorld API is running!'));

// ✅ ROUTES

// Account/Auth
app.use('/api/check', require('./mxgamecoder/mxroutes/mxcheck'));
app.use('/register', require('./mxgamecoder/mxroutes/mxregister'));
app.use('/', require('./mxgamecoder/mxroutes/mxverify'));
app.use('/login', require('./mxgamecoder/mxroutes/mxlogin'));

// User Actions
app.use('/api', require('./mxgamecoder/mxroutes/mxuser'));
app.use('/mx', require('./mxgamecoder/mxroutes/mxforgot'));
app.use('/mx', require('./mxgamecoder/mxroutes/mxresetpassword'));
app.use('/mx', require('./mxgamecoder/mxroutes/mxdelete'));
app.use('/mx', require('./mxgamecoder/mxroutes/mxprofile'));
app.use('/mx', require('./mxgamecoder/mxroutes/mxresendVerification'));
app.use('/mx', require('./mxgamecoder/mxroutes/mxdeactivate'));
app.use('/mx', require('./mxgamecoder/mxroutes/deactivation-status'));

// File/Notification
app.use('/mx', require('./mxgamecoder/mxroutes/mxfilemanager'));
app.use('/mx/notifications', require('./mxgamecoder/mxutils/mxnotifyRoutes'));
app.use('/mx', require('./mxgamecoder/mxutils/updateNotify'));

// SaChat Real-Time System
app.use('/ms', require('./mxgamecoder/mxsachat/mxjoin'));
app.use('/ms', require('./mxgamecoder/mxsachat/mxgenerateid'));
app.use('/ms', require('./mxgamecoder/mxsachat/mxaddcontact'));
app.use('/ms', require('./mxgamecoder/mxsachat/mxsachat-voice'));

// Start server with DB connection
server.listen(PORT, async () => {
  try {
    await pool.connect();
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('🔥 PostgreSQL Connected Successfully!');
  } catch (error) {
    console.error('❌ PostgreSQL Connection Failed:', error);
  }
});
