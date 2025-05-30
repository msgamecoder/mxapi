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
app.use('/ms', require('./mxgamecoder/mxsachat/mxchatroom'));
app.use('/ms', require('./mxgamecoder/mxsachat/mxgenerateid'));
app.use('/ms', require('./mxgamecoder/mxsachat/mxaddcontact'));
app.use('/ms', require('./mxgamecoder/mxsachat/mxsachat-voice'));
// Socket.IO chat logic
const socketHandler = require('./mxgamecoder/mxsachat/mxsocket');
socketHandler(io); // ✅ pass app as well

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
