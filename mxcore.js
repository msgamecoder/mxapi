require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const pool = require('./mxgamecoder/mxconfig/mxdatabase');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://127.0.0.1:5500', 'https://mxgamecoder.lovestoblog.com'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://127.0.0.1:5500', 'https://mxgamecoder.lovestoblog.com'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Track online users
const connectedUsers = new Map();
app.set('connectedUsers', connectedUsers);

io.on('connection', (socket) => {
  console.log(`🔌 New user connected: ${socket.id}`);

  socket.on('register', (userId) => {
    connectedUsers.set(userId, socket.id);
    console.log(`📲 User ${userId} is now online`);
  });

  socket.on('disconnect', () => {
    for (const [userId, sockId] of connectedUsers.entries()) {
      if (sockId === socket.id) {
        connectedUsers.delete(userId);
        console.log(`⚡ User ${userId} disconnected`);
        break;
      }
    }
  });
});

app.set('io', io);

// Routes
app.get('/', (req, res) => res.send('🔥 MXWorld API is running!'));

app.use('/api/check', require('./mxgamecoder/mxroutes/mxcheck'));
app.use('/register', require('./mxgamecoder/mxroutes/mxregister'));
app.use('/', require('./mxgamecoder/mxroutes/mxverify'));
app.use('/login', require('./mxgamecoder/mxroutes/mxlogin'));
app.use('/api', require('./mxgamecoder/mxroutes/mxuser'));
app.use("/mx", require("./mxgamecoder/mxroutes/mxforgot"));
app.use("/mx", require("./mxgamecoder/mxroutes/mxresetpassword"));
app.use("/mx", require("./mxgamecoder/mxroutes/mxdelete"));
app.use("/mx", require("./mxgamecoder/mxroutes/mxprofile"));
app.use("/mx", require("./mxgamecoder/mxroutes/mxresendVerification"));
app.use("/mx", require("./mxgamecoder/mxroutes/mxfilemanager"));
app.use("/mx/notifications", require("./mxgamecoder/mxutils/mxnotifyRoutes"));
app.use("/mx", require("./mxgamecoder/mxutils/updateNotify"));
app.use("/mx", require("./mxgamecoder/mxroutes/mxdeactivate"));
app.use("/mx", require("./mxgamecoder/mxroutes/deactivation-status"));
app.use("/ms", require("./mxgamecoder/mxsachat/mxjoin"));
app.use("/ms", require("./mxgamecoder/mxsachat/mxgenerateid"));
app.use("/ms", require("./mxgamecoder/mxsachat/mxaddcontact"));

server.listen(PORT, async () => {
  try {
    await pool.connect();
    console.log(`🚀 Server running on port ${PORT}`);
    console.log('🔥 PostgreSQL Connected Successfully!');
  } catch (error) {
    console.error('❌ PostgreSQL Connection Failed:', error);
  }
});
