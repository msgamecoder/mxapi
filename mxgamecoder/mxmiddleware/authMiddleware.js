const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware to check for a valid JWT token
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Get token from Authorization header

    if (!token) {
        return res.status(403).json({ error: '🔒 No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // Verify token
        req.user = decoded; // Attach the user data to the request object
        next(); // Proceed to the next middleware or route handler
    } catch (err) {
        return res.status(401).json({ error: '🔴 Invalid or expired token' });
    }
};

module.exports = authMiddleware;