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

// Add userID-to-socketID mapping
const connectedUsers = new Map();

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

// Attach io to app for routes to access
app.set('io', io);

// Test API Route
app.get('/', (req, res) => {
    res.send('🔥 MXWorld API is running!');
});

// Routes
const mxcheck = require('./mxgamecoder/mxroutes/mxcheck'); // ✅ Ensure correct path
app.use('/api/check', mxcheck);


/*// Username, email, phone check route
console.log('🔍 Available routes:');
app._router.stack.forEach((r) => {
    if (r.route && r.route.path) {
        console.log(`👉 ${r.route.path}`);
    }
});*/

const mxregister = require('./mxgamecoder/mxroutes/mxregister');
app.use('/register', mxregister);

const mxverify = require('./mxgamecoder/mxroutes/mxverify');
app.use('/', mxverify);

const mxlogin = require('./mxgamecoder/mxroutes/mxlogin');
app.use('/login', mxlogin);

const mxuser = require('./mxgamecoder/mxroutes/mxuser');
app.use('/api', mxuser);

const mxforgot = require("./mxgamecoder/mxroutes/mxforgot");
app.use("/mx", mxforgot);

const mxresetPasswordRoute = require("./mxgamecoder/mxroutes/mxresetpassword");
app.use("/mx", mxresetPasswordRoute);

const mxdelete = require("./mxgamecoder/mxroutes/mxdelete");
app.use("/mx", mxdelete);

const profileRoutes = require("./mxgamecoder/mxroutes/mxprofile");
app.use("/mx", profileRoutes);

const mxresendVerification = require("./mxgamecoder/mxroutes/mxresendVerification");
app.use("/mx", mxresendVerification);

const mxfilemanager = require("./mxgamecoder/mxroutes/mxfilemanager");
app.use("/mx", mxfilemanager);

const mxnotifyRoutes = require("./mxgamecoder/mxutils/mxnotifyRoutes");
app.use("/mx/notifications", mxnotifyRoutes);

const updateNotify = require("./mxgamecoder/mxutils/updateNotify");
app.use("/mx", updateNotify);

const mxdeactivate = require("./mxgamecoder/mxroutes/mxdeactivate");
app.use("/mx", mxdeactivate);

const deactivationStatus = require("./mxgamecoder/mxroutes/deactivation-status");
app.use("/mx", deactivationStatus);

const sachat = require("./mxgamecoder/mxsachat/mxjoin");
app.use("/ms", sachat);

const mxgenerateid = require("./mxgamecoder/mxsachat/mxgenerateid");
app.use("/ms", mxgenerateid);

const mxaddcontact = require("./mxgamecoder/mxsachat/mxaddcontact");
app.use("/ms", mxaddcontact);

// Start Server
app.listen(PORT, async () => {
    try {
        await pool.connect();
        console.log(`🚀 Server running on port ${PORT}`);
        console.log('🔥 PostgreSQL Connected Successfully!');
    } catch (error) {
        console.error('❌ PostgreSQL Connection Failed:', error);
    }
});
