
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "../../database_name.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Helper to safely add column if not exists
function addColumnIfNotExists(table, column, definition) {
    try {
        const info = db.prepare(`PRAGMA table_info(${table})`).all();
        if (!info.some(c => c.name === column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
    } catch (e) {
        // Table might not exist yet
    }
}

// 1. Users
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
addColumnIfNotExists("users", "reset_token", "TEXT");
addColumnIfNotExists("users", "reset_token_expires", "TEXT");

// 2. Products
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

// 3. Product Variants
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

// 4. Plans
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
addColumnIfNotExists("plans", "price", "REAL DEFAULT 0.00");
addColumnIfNotExists("plans", "allow_pause", "INTEGER DEFAULT 1");
addColumnIfNotExists("plans", "allow_renew", "INTEGER DEFAULT 1");
addColumnIfNotExists("plans", "allow_close_early", "INTEGER DEFAULT 1");

// 5. Tax Rules
db.exec(`
    CREATE TABLE IF NOT EXISTS tax_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        rate REAL NOT NULL CHECK (rate >= 0),
        is_default INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

const taxCount = db.prepare("SELECT COUNT(*) AS count FROM tax_rules").get();
if (taxCount.count === 0) {
    db.prepare(`
        INSERT INTO tax_rules (name, rate, is_default, is_active)
        VALUES ('Standard Tax', 10.0, 1, 1)
    `).run();
}

// 6. Discounts
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
addColumnIfNotExists("discounts", "product_id", "INTEGER REFERENCES products(id)");
addColumnIfNotExists("discounts", "applies_to", "TEXT DEFAULT 'subscription'");

// 7. Quotation Templates
db.exec(`
    CREATE TABLE IF NOT EXISTS quotation_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        plan_id INTEGER NOT NULL REFERENCES plans(id),
        validity_days INTEGER NOT NULL DEFAULT 30,
        payment_terms TEXT NOT NULL DEFAULT 'immediate',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

// 8. Quotation Template Lines
db.exec(`
    CREATE TABLE IF NOT EXISTS quotation_template_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_id INTEGER NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        variant_id INTEGER REFERENCES product_variants(id),
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        tax_rate REAL DEFAULT 0.00
    );
`);

// 9. Subscriptions
db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'Draft'
            CHECK(status IN ('Draft','Quotation','Confirmed','Active','Paused','Closed')),
        payment_terms TEXT NOT NULL DEFAULT 'immediate',
        start_date TEXT NOT NULL,
        end_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        subscription_number TEXT,
        next_billing_date TEXT,
        last_billed_at TEXT,
        notes TEXT,
        auto_close INTEGER DEFAULT 0,
        CHECK (end_date IS NULL OR end_date >= start_date)
    );
`);
addColumnIfNotExists("subscriptions", "subscription_number", "TEXT");
addColumnIfNotExists("subscriptions", "next_billing_date", "TEXT");
addColumnIfNotExists("subscriptions", "last_billed_at", "TEXT");
addColumnIfNotExists("subscriptions", "notes", "TEXT");
addColumnIfNotExists("subscriptions", "auto_close", "INTEGER DEFAULT 0");

// Safe migration of check constraint on subscriptions to include 'Paused'
const subSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='subscriptions'").get()?.sql || "";
if (subSql && !subSql.includes("'Paused'")) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
        CREATE TABLE subscriptions_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
            status TEXT NOT NULL DEFAULT 'Draft'
                CHECK(status IN ('Draft','Quotation','Confirmed','Active','Paused','Closed')),
            payment_terms TEXT NOT NULL DEFAULT 'immediate',
            start_date TEXT NOT NULL,
            end_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            subscription_number TEXT,
            next_billing_date TEXT,
            last_billed_at TEXT,
            notes TEXT,
            auto_close INTEGER DEFAULT 0,
            CHECK (end_date IS NULL OR end_date >= start_date)
        );
        INSERT INTO subscriptions_v2 (id, customer_id, plan_id, status, payment_terms, start_date, end_date, created_at, updated_at, subscription_number, next_billing_date, last_billed_at, notes, auto_close)
        SELECT id, customer_id, plan_id, status, payment_terms, start_date, end_date, created_at, updated_at, subscription_number, next_billing_date, last_billed_at, notes, auto_close FROM subscriptions;
        DROP TABLE subscriptions;
        ALTER TABLE subscriptions_v2 RENAME TO subscriptions;
    `);
    db.pragma("foreign_keys = ON");
}

// 10. Subscription Items
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
addColumnIfNotExists("subscription_items", "tax_rate", "REAL DEFAULT 0.00");
addColumnIfNotExists("subscription_items", "tax_amount", "REAL DEFAULT 0.00");
addColumnIfNotExists("subscription_items", "line_total", "REAL DEFAULT 0.00");

// 11. Invoices
db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'Draft'
            CHECK(status IN ('Draft','Confirmed','Paid','Cancelled')),
        subtotal REAL NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
        tax_amount REAL NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
        discount_amount REAL NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
        total_amount REAL NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
        due_date TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        invoice_number TEXT,
        paid_amount REAL DEFAULT 0.00,
        sent_at TEXT
    );
`);
addColumnIfNotExists("invoices", "invoice_number", "TEXT");
addColumnIfNotExists("invoices", "paid_amount", "REAL DEFAULT 0.00");
addColumnIfNotExists("invoices", "sent_at", "TEXT");

// Safe migration of check constraint on invoices to include 'Cancelled'
const invSql = db.prepare("SELECT sql FROM sqlite_master WHERE name='invoices'").get()?.sql || "";
if (invSql && !invSql.includes("'Cancelled'")) {
    db.pragma("foreign_keys = OFF");
    db.exec(`
        CREATE TABLE invoices_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
            status TEXT NOT NULL DEFAULT 'Draft'
                CHECK(status IN ('Draft','Confirmed','Paid','Cancelled')),
            subtotal REAL NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
            tax_amount REAL NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
            discount_amount REAL NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
            total_amount REAL NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
            due_date TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            invoice_number TEXT,
            paid_amount REAL DEFAULT 0.00,
            sent_at TEXT
        );
        INSERT INTO invoices_v2 (id, subscription_id, status, subtotal, tax_amount, discount_amount, total_amount, due_date, created_at, invoice_number, paid_amount, sent_at)
        SELECT id, subscription_id, status, subtotal, tax_amount, discount_amount, total_amount, due_date, created_at, invoice_number, paid_amount, sent_at FROM invoices;
        DROP TABLE invoices;
        ALTER TABLE invoices_v2 RENAME TO invoices;
    `);
    db.pragma("foreign_keys = ON");
}

// 12. Invoice Lines
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

// 13. Payments
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

// 14. Password Resets
db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

// High-performance Indexes for sub-2-second queries
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_subs_plan ON subscriptions(plan_id);
    CREATE INDEX IF NOT EXISTS idx_subs_next_billing ON subscriptions(next_billing_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_sub ON invoices(subscription_id);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
`);

module.exports = db;
