
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "../../database_name.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Users
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

// Products
db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        sales_price REAL NOT NULL CHECK (sales_price >= 0),
        cost_price  REAL NOT NULL CHECK (cost_price  >= 0),
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

// Product Variants
db.exec(`
    CREATE TABLE IF NOT EXISTS product_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_name TEXT NOT NULL,
        price_modifier REAL NOT NULL DEFAULT 0.00,
        cost_modifier  REAL NOT NULL DEFAULT 0.00,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

// Plans
db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        frequency TEXT NOT NULL
            CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
        minimum_quantity INTEGER NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
        start_date TEXT NOT NULL,
        end_date TEXT,
        auto_close INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CHECK (end_date IS NULL OR end_date >= start_date)
    );
`);

// Discounts
db.exec(`
    CREATE TABLE IF NOT EXISTS discounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('fixed', 'percentage')),
        value REAL NOT NULL CHECK (value > 0),
        min_purchase_amount REAL DEFAULT 0.00 CHECK (min_purchase_amount >= 0),
        min_quantity INTEGER DEFAULT 1 CHECK (min_quantity >= 1),
        usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
        times_used INTEGER NOT NULL DEFAULT 0 CHECK (times_used >= 0),
        valid_from TEXT NOT NULL,
        valid_until TEXT,
        CHECK (valid_until IS NULL OR valid_until >= valid_from)
    );
`);

// Subscriptions
db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'Draft'
            CHECK(status IN ('Draft','Quotation','Confirmed','Active','Closed')),
        payment_terms TEXT NOT NULL DEFAULT 'immediate',
        start_date TEXT NOT NULL,
        end_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CHECK (end_date IS NULL OR end_date >= start_date)
    );
`);

// Subscription Items
db.exec(`
    CREATE TABLE IF NOT EXISTS subscription_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0)
    );
`);

// Invoices
db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'Draft'
            CHECK(status IN ('Draft','Confirmed','Paid')),
        subtotal REAL NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
        tax_amount REAL NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
        discount_amount REAL NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
        total_amount REAL NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
        due_date TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

// Invoice Lines
db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        tax_rate REAL NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
        line_total REAL NOT NULL CHECK (line_total >= 0)
    );
`);

// Payments
db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
        payment_method TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount > 0),
        payment_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
    );
`);

module.exports = db;
