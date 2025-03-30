const express = require('express');
const router = express.Router();
const authMiddleware = require('../mxmiddleware/authMiddleware'); // Import the middleware

// Example of a protected route
router.get('/api/user', authMiddleware, async (req, res) => {
    try {
        // Assuming req.user is set by the authMiddleware, it contains the decoded JWT
        const userId = req.user.id;

        // Query your database or do other operations based on userId
        const result = await pool.query('SELECT username, email FROM users WHERE id = $1', [userId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ username: result.rows[0].username, email: result.rows[0].email });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;