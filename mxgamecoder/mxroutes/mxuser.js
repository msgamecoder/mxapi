const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../mxconfig/mxdatabase');
require('dotenv').config();
const router = express.Router();
const authMiddleware = require("../mxmiddleware/authMiddleware");

// ✅ Middleware: Verify JWT
function authenticateToken(req, res, next) {
    const authHeader = req.header("Authorization");
    if (!authHeader) {
        console.log("🚫 No Authorization header received.");
        return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1]; // Extract token from "Bearer TOKEN"
    if (!token) {
        console.log("🚫 No token found in Authorization header.");
        return res.status(401).json({ error: "Unauthorized" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log("🚫 Invalid token:", err.message);
            return res.status(403).json({ error: "Invalid token" });
        }
        req.user = user;
        next();
    });
}

// ✅ Protected Route: Get User Info
router.get("/user", authenticateToken, async (req, res) => {
    try {
        console.log("✅ User Authenticated:", req.user); // Debugging

        const userQuery = "SELECT username FROM users WHERE id = $1";
        const result = await pool.query(userQuery, [req.user.id]);

        if (result.rowCount === 0) return res.status(404).json({ error: "User not found" });

        res.json({ username: result.rows[0].username });
    } catch (error) {
        console.error("❌ Error fetching user:", error);
        res.status(500).json({ error: "Server error" });
    }
});

router.get("/user-info", authMiddleware, async (req, res) => {
  res.json({ user: { id: req.user.id } });
});

module.exports = router;
