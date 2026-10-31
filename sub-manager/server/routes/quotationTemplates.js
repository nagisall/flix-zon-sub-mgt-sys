const express = require("express");
const router = express.Router();
const db = require("../config/database");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

// 1. GET ALL QUOTATION TEMPLATES (admin/staff)
router.get(
    "/",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const templates = db.prepare(`
                SELECT qt.*, p.name AS plan_name, p.frequency, p.price AS plan_price
                FROM quotation_templates qt
                JOIN plans p ON qt.plan_id = p.id
                ORDER BY qt.created_at DESC
            `).all();

            const allLines = db.prepare(`
                SELECT qtl.*, pr.name AS product_name, pv.variant_name
                FROM quotation_template_lines qtl
                JOIN products pr ON qtl.product_id = pr.id
                LEFT JOIN product_variants pv ON qtl.variant_id = pv.id
            `).all();

            const result = templates.map(t => ({
                ...t,
                lines: allLines.filter(l => l.template_id === t.id)
            }));

            res.status(200).json({ message: "Quotation templates retrieved.", data: result });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error fetching templates.", error: err.message });
        }
    }
);

// 2. GET SINGLE QUOTATION TEMPLATE
router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const template = db.prepare(`
                SELECT qt.*, p.name AS plan_name, p.frequency, p.price AS plan_price
                FROM quotation_templates qt
                JOIN plans p ON qt.plan_id = p.id
                WHERE qt.id = ?
            `).get(req.params.id);

            if (!template) {
                return res.status(404).json({ message: "Quotation template not found." });
            }

            const lines = db.prepare(`
                SELECT qtl.*, pr.name AS product_name, pv.variant_name
                FROM quotation_template_lines qtl
                JOIN products pr ON qtl.product_id = pr.id
                LEFT JOIN product_variants pv ON qtl.variant_id = pv.id
                WHERE qtl.template_id = ?
            `).all(req.params.id);

            res.status(200).json({ message: "Quotation template retrieved.", data: { ...template, lines } });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error fetching template.", error: err.message });
        }
    }
);

// 3. CREATE QUOTATION TEMPLATE
//    Body: { name, plan_id, validity_days?, payment_terms?, notes?, lines: [{ product_id, variant_id?, quantity, unit_price, tax_rate? }] }
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { name, plan_id, validity_days, payment_terms, notes, lines } = req.body;

            if (!name || !plan_id) {
                return res.status(400).json({ message: "name and plan_id are required." });
            }

            const plan = db.prepare("SELECT id FROM plans WHERE id = ?").get(plan_id);
            if (!plan) {
                return res.status(400).json({ message: "plan_id does not refer to an existing plan." });
            }

            if (!lines || !Array.isArray(lines) || lines.length === 0) {
                return res.status(400).json({ message: "At least one product line is required." });
            }

            // Get default tax rate if not provided
            const defaultTax = db.prepare("SELECT rate FROM tax_rules WHERE is_default = 1 AND is_active = 1").get();
            const fallbackTax = defaultTax ? defaultTax.rate : 0.00;

            const createTemplateTx = db.transaction(() => {
                const result = db.prepare(`
                    INSERT INTO quotation_templates (name, plan_id, validity_days, payment_terms, notes)
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    name.trim(),
                    plan_id,
                    parseInt(validity_days) || 30,
                    payment_terms || "immediate",
                    notes || null
                );

                const templateId = result.lastInsertRowid;

                const insertLine = db.prepare(`
                    INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, unit_price, tax_rate)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                for (const line of lines) {
                    insertLine.run(
                        templateId,
                        line.product_id,
                        line.variant_id || null,
                        parseInt(line.quantity) || 1,
                        parseFloat(line.unit_price) || 0.00,
                        line.tax_rate != null ? parseFloat(line.tax_rate) : fallbackTax
                    );
                }

                return templateId;
            });

            const templateId = createTemplateTx();
            const created = db.prepare("SELECT * FROM quotation_templates WHERE id = ?").get(templateId);
            const createdLines = db.prepare("SELECT * FROM quotation_template_lines WHERE template_id = ?").all(templateId);

            res.status(201).json({
                message: "Quotation template created successfully.",
                data: { ...created, lines: createdLines }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error creating quotation template.", error: err.message });
        }
    }
);

// 4. CREATE A QUOTE / SUBSCRIPTION FROM TEMPLATE
//    Body: { customer_id, start_date? }
router.post(
    "/:id/create-quote",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { customer_id, start_date } = req.body;

            if (!customer_id) {
                return res.status(400).json({ message: "customer_id is required." });
            }

            const customer = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(customer_id);
            if (!customer) {
                return res.status(400).json({ message: "customer_id does not refer to an existing user." });
            }

            const template = db.prepare("SELECT * FROM quotation_templates WHERE id = ?").get(req.params.id);
            if (!template) {
                return res.status(404).json({ message: "Quotation template not found." });
            }

            const lines = db.prepare("SELECT * FROM quotation_template_lines WHERE template_id = ?").all(template.id);
            if (lines.length === 0) {
                return res.status(400).json({ message: "Quotation template has no product lines." });
            }

            const startDateObj = start_date ? new Date(start_date) : new Date();
            const startDateStr = startDateObj.toISOString().split("T")[0];

            const expiryDateObj = new Date(startDateObj);
            expiryDateObj.setDate(expiryDateObj.getDate() + (template.validity_days || 30));
            const expiryDateStr = expiryDateObj.toISOString().split("T")[0];

            const createQuoteTx = db.transaction(() => {
                const subResult = db.prepare(`
                    INSERT INTO subscriptions (
                        customer_id, plan_id, status, payment_terms, start_date, end_date, notes
                    ) VALUES (?, ?, 'Quotation', ?, ?, ?, ?)
                `).run(
                    customer_id,
                    template.plan_id,
                    template.payment_terms || "immediate",
                    startDateStr,
                    expiryDateStr,
                    `Created from quotation template: ${template.name}`
                );

                const subscriptionId = subResult.lastInsertRowid;
                const subNumber = `QUOTE-${String(subscriptionId).padStart(5, "0")}`;

                db.prepare("UPDATE subscriptions SET subscription_number = ? WHERE id = ?").run(subNumber, subscriptionId);

                const insertItem = db.prepare(`
                    INSERT INTO subscription_items (
                        subscription_id, product_id, variant_id, quantity, unit_price, tax_rate, tax_amount, line_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const line of lines) {
                    const qty = line.quantity || 1;
                    const price = line.unit_price || 0.00;
                    const taxRate = line.tax_rate || 0.00;
                    const subtotal = qty * price;
                    const taxAmount = subtotal * (taxRate / 100);
                    const lineTotal = subtotal + taxAmount;

                    insertItem.run(
                        subscriptionId,
                        line.product_id,
                        line.variant_id || null,
                        qty,
                        price,
                        taxRate,
                        taxAmount,
                        lineTotal
                    );
                }

                return subscriptionId;
            });

            const subscriptionId = createQuoteTx();
            const quote = db.prepare(`
                SELECT s.*, p.name AS plan_name, p.frequency, u.name AS customer_name, u.email AS customer_email
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                JOIN users u ON s.customer_id = u.id
                WHERE s.id = ?
            `).get(subscriptionId);

            const quoteItems = db.prepare(`
                SELECT si.*, pr.name AS product_name, pv.variant_name
                FROM subscription_items si
                JOIN products pr ON si.product_id = pr.id
                LEFT JOIN product_variants pv ON si.variant_id = pv.id
                WHERE si.subscription_id = ?
            `).all(subscriptionId);

            res.status(201).json({
                message: "Quotation created successfully from template.",
                data: { ...quote, items: quoteItems }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error creating quote from template.", error: err.message });
        }
    }
);

module.exports = router;
