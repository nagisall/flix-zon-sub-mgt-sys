const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://your_username:your_password@localhost:5432/your_database'
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};