const bcrypt = require('bcryptjs');
const db = require('./config/database');

async function seedDemoData() {
    console.log('Seeding Brightloop demo environment...');

    const defaultPassword = 'Brightloop@2026';
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    // 1. Seed Demo Users
    const users = [
        { name: 'Admin Lead', email: 'admin@brightloop.io', role: 'admin' },
        { name: 'Sarah Staff (Operations)', email: 'staff@brightloop.io', role: 'staff' },
        { name: 'Acme Technologies (Demo Customer)', email: 'customer@brightloop.io', role: 'customer' },
        { name: 'Horizon Logistics Ltd', email: 'billing@horizonlogistics.com', role: 'customer' }
    ];

    const insertUser = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role, name = excluded.name
    `);

    for (const u of users) {
        insertUser.run(u.name, u.email, passwordHash, u.role);
    }
    console.log('✓ Users verified (admin@brightloop.io, staff@brightloop.io, customer@brightloop.io)');

    // 2. Seed Tax Rules
    const existingTax = db.prepare("SELECT id FROM tax_rules WHERE name = 'Standard Tax'").get();
    if (!existingTax) {
        db.prepare(`
            INSERT INTO tax_rules (name, rate, is_default, is_active)
            VALUES ('Standard Tax', 10.0, 1, 1), ('EU VAT', 15.0, 0, 1)
        `).run();
        console.log('✓ Default tax rules created (10% Standard, 15% VAT)');
    }

    // 3. Seed Products if none exist
    const prodCount = db.prepare("SELECT count(*) as count FROM products").get().count;
    if (prodCount === 0) {
        const insertProd = db.prepare(`
            INSERT INTO products (name, type, sales_price, cost_price, notes)
            VALUES (?, ?, ?, ?, ?)
        `);
        const p1 = insertProd.run('Brightloop ERP Core', 'Software', 1200.0, 300.0, 'Core multi-entity ERP suite').lastInsertRowid;
        const p2 = insertProd.run('Billing & Invoicing Engine', 'Module', 450.0, 80.0, 'Automated recurring billing and payment collection').lastInsertRowid;
        const p3 = insertProd.run('Customer CRM Desk', 'Service', 350.0, 50.0, 'Omnichannel customer success desk').lastInsertRowid;
        const p4 = insertProd.run('Warehouse & Inventory Sync', 'Module', 600.0, 120.0, 'Real-time multi-warehouse stock sync').lastInsertRowid;

        // Add variants
        const insertVar = db.prepare(`
            INSERT INTO product_variants (product_id, variant_name, price_modifier)
            VALUES (?, ?, ?)
        `);
        insertVar.run(p1, 'Standard Cloud Edition', 0.0);
        insertVar.run(p1, 'Enterprise High-Availability Tier', 500.0);
        console.log('✓ Standard product catalog and variants seeded');
    }

    // 4. Seed Plans if none exist
    const planCount = db.prepare("SELECT count(*) as count FROM plans").get().count;
    if (planCount === 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const insertPlan = db.prepare(`
            INSERT INTO plans (name, frequency, price, minimum_quantity, start_date, auto_close, allow_pause, allow_renew, allow_close_early)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertPlan.run('Monthly Business Growth Plan', 'monthly', 1200.0, 1, todayStr, 0, 1, 1, 1);
        insertPlan.run('Annual Enterprise Contract', 'yearly', 12000.0, 5, todayStr, 1, 1, 1, 1);
        insertPlan.run('High-Growth Weekly Pilot', 'weekly', 320.0, 1, todayStr, 0, 1, 1, 1);
        console.log('✓ Recurring billing plans seeded');
    }

    console.log('✨ Brightloop Demo Seeding Complete!');
}

seedDemoData().catch(console.error);
