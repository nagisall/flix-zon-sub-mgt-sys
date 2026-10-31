const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// Valid status transitions
const INVOICE_TRANSITIONS = {
    Draft:     ["Confirmed", "Cancelled"],
    Confirmed: ["Paid", "Cancelled"],
    Paid:      [],
    Cancelled: ["Draft"]
};

// 1. CREATE INVOICE MANUALLY (admin/staff only)
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
                if (!line.description || line.quantity == null || line.unit_price == null) {
                    return res.status(400).json({
                        message: `Line at index ${i} must have description, quantity, and unit_price.`
                    });
                }
            }

            const subscription = db.prepare("SELECT id FROM subscriptions WHERE id = ?").get(subscription_id);
            if (!subscription) {
                return res.status(400).json({ message: "subscription_id does not refer to an existing subscription." });
            }

            const defaultTax = db.prepare("SELECT rate FROM tax_rules WHERE is_default = 1 AND is_active = 1").get();
            const fallbackTaxRate = defaultTax ? defaultTax.rate : 0.00;

            const discountAmt = parseFloat(discount_amount) || 0;

            const createInvoice = db.transaction(() => {
                let subtotal = 0;
                let tax_amount = 0;
                const preparedLines = lines.map(line => {
                    const qty = parseInt(line.quantity) || 1;
                    const price = parseFloat(line.unit_price) || 0.00;
                    const taxRate = line.tax_rate != null ? parseFloat(line.tax_rate) : fallbackTaxRate;
                    const lineSubtotal = qty * price;
                    const lineTax = lineSubtotal * (taxRate / 100);
                    const line_total = lineSubtotal + lineTax;
                    subtotal += lineSubtotal;
                    tax_amount += lineTax;
                    return { ...line, quantity: qty, unit_price: price, tax_rate: taxRate, line_total };
                });

                const total_amount = Math.max(0, subtotal + tax_amount - discountAmt);

                const invResult = db.prepare(`
                    INSERT INTO invoices (subscription_id, subtotal, tax_amount, discount_amount, total_amount, due_date, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'Draft')
                `).run(subscription_id, subtotal, tax_amount, discountAmt, total_amount, due_date);

                const invoiceId = invResult.lastInsertRowid;
                const invNumber = `INV-${String(invoiceId).padStart(6, "0")}`;
                db.prepare("UPDATE invoices SET invoice_number = ? WHERE id = ?").run(invNumber, invoiceId);

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

                return invoiceId;
            });

            const invoiceId = createInvoice();
            const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
            const invoiceLines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ?").all(invoiceId);

            return res.status(201).json({ message: "Invoice created successfully.", data: { ...invoice, lines: invoiceLines } });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Server error while creating invoice.", error: err.message });
        }
    }
);

// 2. LIST INVOICES (with filters: status, overdue, customer)
router.get("/", authenticateToken, (req, res) => {
    try {
        const { status, filter } = req.query;
        const todayStr = new Date().toISOString().split("T")[0];

        let query = `
            SELECT i.*, s.customer_id, s.subscription_number,
                   u.name AS customer_name, u.email AS customer_email,
                   p.name AS plan_name,
                   (i.total_amount - i.paid_amount) AS outstanding_amount,
                   CASE
                       WHEN i.status != 'Paid' AND i.status != 'Cancelled' AND i.due_date < ? THEN 1
                       ELSE 0
                   END AS is_overdue
            FROM invoices i
            JOIN subscriptions s ON i.subscription_id = s.id
            JOIN users u ON s.customer_id = u.id
            JOIN plans p ON s.plan_id = p.id
        `;

        const conditions = [];
        const params = [todayStr];

        if (req.user.role === "customer") {
            conditions.push("s.customer_id = ?");
            params.push(req.user.id);
        }

        if (status) {
            conditions.push("i.status = ?");
            params.push(status);
        }

        if (filter === "overdue") {
            conditions.push("i.status != 'Paid' AND i.status != 'Cancelled' AND i.due_date < ?");
            params.push(todayStr);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY i.created_at DESC";

        const rows = db.prepare(query).all(...params);
        return res.status(200).json({ message: "Invoices retrieved.", data: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while listing invoices.", error: err.message });
    }
});

// 3. GET SINGLE INVOICE WITH LINES & PAYMENTS
router.get("/:id", authenticateToken, (req, res) => {
    try {
        const invoice = db.prepare(`
            SELECT i.*, s.customer_id, s.subscription_number, s.payment_terms,
                   u.name AS customer_name, u.email AS customer_email,
                   p.name AS plan_name
            FROM invoices i
            JOIN subscriptions s ON i.subscription_id = s.id
            JOIN users u ON s.customer_id = u.id
            JOIN plans p ON s.plan_id = p.id
            WHERE i.id = ?
        `).get(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found." });
        }

        if (req.user.role === "customer" && invoice.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        const lines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ?").all(req.params.id);
        const payments = db.prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC").all(req.params.id);

        const outstanding = Math.max(0, invoice.total_amount - (invoice.paid_amount || 0));

        return res.status(200).json({
            message: "Invoice retrieved.",
            data: {
                ...invoice,
                lines,
                payments,
                outstanding_amount: outstanding
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while fetching invoice.", error: err.message });
    }
});

// 4. PRINTABLE VIEW DATA
router.get("/:id/print", authenticateToken, (req, res) => {
    try {
        const invoice = db.prepare(`
            SELECT i.*, s.customer_id, s.subscription_number, s.payment_terms,
                   u.name AS customer_name, u.email AS customer_email,
                   p.name AS plan_name
            FROM invoices i
            JOIN subscriptions s ON i.subscription_id = s.id
            JOIN users u ON s.customer_id = u.id
            JOIN plans p ON s.plan_id = p.id
            WHERE i.id = ?
        `).get(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found." });
        }

        if (req.user.role === "customer" && invoice.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        const lines = db.prepare("SELECT * FROM invoice_lines WHERE invoice_id = ?").all(req.params.id);
        const payments = db.prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC").all(req.params.id);

        return res.status(200).json({
            company: {
                name: "Brightloop Software",
                address: "Innovation Park, Suite 400",
                contact: "billing@brightloop.io"
            },
            invoice: {
                ...invoice,
                lines,
                payments,
                outstanding_amount: Math.max(0, invoice.total_amount - (invoice.paid_amount || 0))
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error fetching print view." });
    }
});

// 5. SEND INVOICE (admin/staff)
router.post(
    "/:id/send",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const invoice = db.prepare(`
                SELECT i.*, u.email AS customer_email, u.name AS customer_name
                FROM invoices i
                JOIN subscriptions s ON i.subscription_id = s.id
                JOIN users u ON s.customer_id = u.id
                WHERE i.id = ?
            `).get(req.params.id);

            if (!invoice) {
                return res.status(404).json({ message: "Invoice not found." });
            }

            db.prepare("UPDATE invoices SET sent_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);

            res.status(200).json({
                message: `Invoice #${invoice.invoice_number || invoice.id} has been sent to ${invoice.customer_email}.`,
                sent_at: new Date().toISOString()
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error sending invoice." });
        }
    }
);

// 6. CANCEL INVOICE (admin/staff)
router.post(
    "/:id/cancel",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
            if (!invoice) {
                return res.status(404).json({ message: "Invoice not found." });
            }

            if (invoice.status === "Paid") {
                return res.status(400).json({ message: "Cannot cancel an already Paid invoice." });
            }

            db.prepare("UPDATE invoices SET status = 'Cancelled' WHERE id = ?").run(req.params.id);
            const updated = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);

            res.status(200).json({ message: "Invoice cancelled.", data: updated });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error cancelling invoice." });
        }
    }
);

// 7. UPDATE INVOICE STATUS (Draft -> Confirmed -> Paid, or Cancelled)
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

            const validStatuses = ["Draft", "Confirmed", "Paid", "Cancelled"];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ message: `status must be one of: ${validStatuses.join(", ")}` });
            }

            const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
            if (!invoice) {
                return res.status(404).json({ message: "Invoice not found." });
            }

            const allowed = INVOICE_TRANSITIONS[invoice.status] || [];
            if (!allowed.includes(status) && status !== invoice.status) {
                return res.status(400).json({
                    message: `Invalid transition from '${invoice.status}' to '${status}'. Allowed: ${allowed.join(", ") || "None"}.`
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
