const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// 1. GET ALL PAYMENTS (admin/staff sees all, customer sees own)
router.get("/", authenticateToken, (req, res) => {
    try {
        let query = `
            SELECT p.*, i.invoice_number, i.total_amount AS invoice_total,
                   s.subscription_number,
                   u.name AS customer_name, u.email AS customer_email
            FROM payments p
            JOIN invoices i ON p.invoice_id = i.id
            JOIN subscriptions s ON i.subscription_id = s.id
            JOIN users u ON s.customer_id = u.id
        `;
        const params = [];

        if (req.user.role === "customer") {
            query += " WHERE s.customer_id = ?";
            params.push(req.user.id);
        }

        query += " ORDER BY p.payment_date DESC";

        const payments = db.prepare(query).all(...params);
        return res.status(200).json({ message: "Payments retrieved.", data: payments });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while fetching payments.", error: err.message });
    }
});

// 2. POST / — Record a payment (admin/staff only)
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { invoice_id, payment_method, amount, notes, payment_date } = req.body;

            if (!invoice_id || !payment_method || amount == null) {
                return res.status(400).json({ message: "invoice_id, payment_method, and amount are required." });
            }

            const numericAmount = parseFloat(amount);
            if (isNaN(numericAmount) || numericAmount <= 0) {
                return res.status(400).json({ message: "amount must be a positive number." });
            }

            const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoice_id);
            if (!invoice) {
                return res.status(404).json({ message: "Invoice not found." });
            }

            if (invoice.status === "Paid") {
                return res.status(400).json({ message: "Invoice is already fully paid." });
            }

            if (invoice.status === "Cancelled") {
                return res.status(400).json({ message: "Cannot accept payments on a cancelled invoice." });
            }

            // Sum existing payments for this invoice
            const existingPayments = db.prepare(
                "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?"
            ).get(invoice_id);

            const alreadyPaid = existingPayments.paid;
            const remaining = Math.max(0, invoice.total_amount - alreadyPaid);

            if (numericAmount > remaining + 0.001) {
                return res.status(400).json({
                    message: `Payment amount (${numericAmount}) exceeds remaining balance (${remaining.toFixed(2)}) on this invoice.`
                });
            }

            const paymentDateStr = payment_date || new Date().toISOString();

            const recordPayment = db.transaction(() => {
                const result = db.prepare(`
                    INSERT INTO payments (invoice_id, payment_method, amount, notes, payment_date)
                    VALUES (?, ?, ?, ?, ?)
                `).run(invoice_id, payment_method, numericAmount, notes || null, paymentDateStr);

                const newTotalPaid = alreadyPaid + numericAmount;

                // Update paid_amount and auto-mark invoice as Paid if fully covered
                if (newTotalPaid >= invoice.total_amount - 0.001) {
                    db.prepare("UPDATE invoices SET paid_amount = ?, status = 'Paid' WHERE id = ?").run(newTotalPaid, invoice_id);
                } else {
                    db.prepare("UPDATE invoices SET paid_amount = ? WHERE id = ?").run(newTotalPaid, invoice_id);
                }

                return db.prepare("SELECT * FROM payments WHERE id = ?").get(result.lastInsertRowid);
            });

            const payment = recordPayment();
            return res.status(201).json({ message: "Payment recorded successfully.", data: payment });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Server error while recording payment.", error: err.message });
        }
    }
);

// 3. GET /invoice/:invoice_id — List all payments for an invoice (admin/staff or invoice owner)
router.get("/invoice/:invoice_id", authenticateToken, (req, res) => {
    try {
        const invoice = db.prepare(`
            SELECT i.*, s.customer_id
            FROM invoices i
            JOIN subscriptions s ON i.subscription_id = s.id
            WHERE i.id = ?
        `).get(req.params.invoice_id);

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found." });
        }

        // Customers can only view payments for their own invoices
        if (req.user.role === "customer" && invoice.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        const payments = db.prepare(
            "SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC"
        ).all(req.params.invoice_id);

        return res.status(200).json({ message: "Payments retrieved.", data: payments });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while fetching payments.", error: err.message });
    }
});

module.exports = router;
