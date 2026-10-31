const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// POST / — Record a payment (admin/staff only)
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { invoice_id, payment_method, amount, notes } = req.body;

            if (!invoice_id || !payment_method || amount == null) {
                return res.status(400).json({ message: "invoice_id, payment_method, and amount are required." });
            }

            if (typeof amount !== "number" || amount <= 0) {
                return res.status(400).json({ message: "amount must be a positive number." });
            }

            const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoice_id);
            if (!invoice) {
                return res.status(404).json({ message: "Invoice not found." });
            }

            if (invoice.status === "Paid") {
                return res.status(400).json({ message: "Invoice is already fully paid." });
            }

            // Sum existing payments for this invoice
            const existingPayments = db.prepare(
                "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?"
            ).get(invoice_id);

            const alreadyPaid = existingPayments.paid;
            const remaining = invoice.total_amount - alreadyPaid;

            if (amount > remaining) {
                return res.status(400).json({
                    message: `Payment amount (${amount}) exceeds the remaining balance (${remaining.toFixed(2)}) on this invoice.`
                });
            }

            const recordPayment = db.transaction(() => {
                const result = db.prepare(`
                    INSERT INTO payments (invoice_id, payment_method, amount, notes)
                    VALUES (?, ?, ?, ?)
                `).run(invoice_id, payment_method, amount, notes || null);

                const newTotalPaid = alreadyPaid + amount;

                // Auto-mark invoice as Paid if fully covered
                if (newTotalPaid >= invoice.total_amount) {
                    db.prepare("UPDATE invoices SET status = 'Paid' WHERE id = ?").run(invoice_id);
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

// GET /invoice/:invoice_id — List all payments for an invoice (admin/staff or invoice owner)
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
