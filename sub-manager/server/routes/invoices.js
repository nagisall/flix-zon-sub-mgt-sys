const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// POST / — Create invoice for a subscription (admin/staff only)
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { subscription_id, due_date, lines, discount_amount } = req.body;

            if (!subscription_id || !due_date) {
                return res.status(400).json({ message: "subscription_id and due_date are required." });
            }

            if (!lines || !Array.isArray(lines) || lines.length === 0) {
                return res.status(400).json({ message: "At least one line item is required." });
            }

            for (const [i, line] of lines.entries()) {
                if (!line.description || line.quantity == null || line.unit_price == null || line.tax_rate == null) {
                    return res.status(400).json({
                        message: `Line at index ${i} must have description, quantity, unit_price, and tax_rate.`
                    });
                }
            }

            // Verify subscription exists
            const subscription = db.prepare("SELECT id FROM subscriptions WHERE id = ?").get(subscription_id);
            if (!subscription) {
                return res.status(400).json({ message: "subscription_id does not refer to an existing subscription." });
            }

            const discountAmt = parseFloat(discount_amount) || 0;

            const createInvoice = db.transaction(() => {
                // Compute totals from lines
                let subtotal = 0;
                let tax_amount = 0;
                const preparedLines = lines.map(line => {
                    const qty = parseInt(line.quantity);
                    const price = parseFloat(line.unit_price);
                    const taxRate = parseFloat(line.tax_rate);
                    const lineSubtotal = qty * price;
                    const lineTax = lineSubtotal * (taxRate / 100);
                    const line_total = lineSubtotal + lineTax;
                    subtotal += lineSubtotal;
                    tax_amount += lineTax;
                    return { ...line, quantity: qty, unit_price: price, tax_rate: taxRate, line_total };
                });

                const total_amount = Math.max(0, subtotal + tax_amount - discountAmt);

                const invResult = db.prepare(`
                    INSERT INTO invoices (subscription_id, subtotal, tax_amount, discount_amount, total_amount, due_date)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(subscription_id, subtotal, tax_amount, discountAmt, total_amount, due_date);

                const invoiceId = invResult.lastInsertRowid;

                const insertLine = db.prepare(`
                    INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, tax_rate, line_total)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                for (const line of preparedLines) {
                    insertLine.run(
                        invoiceId,
                        line.description,
                        line.quantity,
                        line.unit_price,
                        line.tax_rate,
                        line.line_total
                    );
                }

                const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
                const invoiceLines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ?").all(invoiceId);

                return { invoice, lines: invoiceLines };
            });

            const data = createInvoice();
            return res.status(201).json({ message: "Invoice created successfully.", data });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Server error while creating invoice.", error: err.message });
        }
    }
);

// GET / — List invoices
router.get("/", authenticateToken, (req, res) => {
    try {
        let rows;
        if (req.user.role === "customer") {
            rows = db.prepare(`
                SELECT i.*
                FROM invoices i
                JOIN subscriptions s ON i.subscription_id = s.id
                WHERE s.customer_id = ?
                ORDER BY i.created_at DESC
            `).all(req.user.id);
        } else {
            rows = db.prepare(`
                SELECT i.*, s.customer_id
                FROM invoices i
                JOIN subscriptions s ON i.subscription_id = s.id
                ORDER BY i.created_at DESC
            `).all();
        }
        return res.status(200).json({ message: "Invoices retrieved.", data: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while listing invoices.", error: err.message });
    }
});

// GET /:id — Single invoice with lines
router.get("/:id", authenticateToken, (req, res) => {
    try {
        const invoice = db.prepare(`
            SELECT i.*, s.customer_id
            FROM invoices i
            JOIN subscriptions s ON i.subscription_id = s.id
            WHERE i.id = ?
        `).get(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found." });
        }

        // Enforce ownership for customers
        if (req.user.role === "customer" && invoice.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        const lines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ?").all(req.params.id);

        return res.status(200).json({ message: "Invoice retrieved.", data: { ...invoice, lines } });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while fetching invoice.", error: err.message });
    }
});

// PATCH /:id/status — Update invoice status (admin/staff only)
// Valid transitions: Draft → Confirmed → Paid
router.patch(
    "/:id/status",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { status } = req.body;
            if (!status) {
                return res.status(400).json({ message: "status is required." });
            }

            const validStatuses = ["Draft", "Confirmed", "Paid"];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ message: `status must be one of: ${validStatuses.join(", ")}` });
            }

            const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
            if (!invoice) {
                return res.status(404).json({ message: "Invoice not found." });
            }

            const transitions = { Draft: "Confirmed", Confirmed: "Paid" };
            const expectedNext = transitions[invoice.status];

            if (expectedNext !== status) {
                return res.status(400).json({
                    message: `Invalid transition. Current status is '${invoice.status}'. Expected next: '${expectedNext || "none (already Paid)"}'.`
                });
            }

            db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run(status, req.params.id);

            const updated = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
            return res.status(200).json({ message: "Invoice status updated.", data: updated });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Server error while updating invoice status.", error: err.message });
        }
    }
);

module.exports = router;
