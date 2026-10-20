const { Pool } = require('pg');
require('dotenv').config();
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diatur. Salin .env.example menjadi .env dan isi koneksi PostgreSQL.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : false });
pool.on('error', (err) => console.error('PostgreSQL pool error:', err.message));
module.exports = { pool, query: (text, params) => pool.query(text, params) };
