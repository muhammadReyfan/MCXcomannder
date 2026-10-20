require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('./db');
(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Schema MCX Command Center berhasil disiapkan.');
  } catch (err) { console.error('Gagal menyiapkan database:', err.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
