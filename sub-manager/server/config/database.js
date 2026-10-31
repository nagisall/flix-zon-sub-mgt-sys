
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "../../database_name.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create users table
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,

        role TEXT NOT NULL DEFAULT 'customer'
            CHECK(role IN ('admin', 'staff', 'customer')),

        is_active INTEGER NOT NULL DEFAULT 1
            CHECK(is_active IN (0, 1)),

        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );
`);

module.exports = db;
