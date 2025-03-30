const express = require('express');
const router = express.Router();
const pool = require('../mxconfig/mxdatabase'); // Adjust path if needed

console.log('✅ mxcheck.js routes initialized');
router.stack.forEach((r) => {
    if (r.route && r.route.path) {
        console.log(`👉 mxcheck.js Route: ${r.route.path}`);
    }
});

// Check
router.post('/:type', async (req, res) => {
    console.log(`🔍 Received request for: ${req.params.type}, Value: ${req.body.value}`);

    try {
        const { type } = req.params;
        const { value } = req.body;

        let column;
        if (type === 'check_username') column = 'username';
        else if (type === 'check_email') column = 'email';
        else if (type === 'check_phone') column = 'phone_number';
        else {
            console.log('❌ Invalid check type:', type);
            return res.status(400).json({ error: 'Invalid check type' });
        }

        const result = await pool.query(
            `SELECT 1 FROM users WHERE ${column} = $1 
             UNION 
             SELECT 1 FROM temp_users WHERE ${column} = $1`, 
            [value]
        );        
        console.log(`✅ Query result for ${type}:`, result.rowCount);

        return res.json({ exists: result.rowCount > 0 });
    } catch (error) {
        console.error(`❌ Error checking ${req.params.type}:`, error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;