const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false } // Required for Aiven
});

pool.connect()
    .then(() => console.log('🔥🥺 PostgreSQL Connected Successfully!'))
    .catch(err => console.error('❌ Database Connection Failed:', err));

module.exports = pool;