require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const pool = require('./mxgamecoder/mxconfig/mxdatabase');
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Allow frontend to communicate with backend
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

const mxfilemanager = require("./mxgamecoder/mxroutes/mxfilemanager");
app.use("/mx", mxfilemanager);

const mxnotifyRoutes = require("./mxgamecoder/mxutils/mxnotifyRoutes");
app.use("/mx/notifications", mxnotifyRoutes);


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
