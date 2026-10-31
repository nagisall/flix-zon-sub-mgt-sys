const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// Status transitions
const STATUS_TRANSITIONS = {
    Draft:     ["Quotation", "Confirmed", "Closed"],
    Quotation: ["Confirmed", "Closed"],
    Confirmed: ["Active", "Closed"],
    Active:    ["Paused", "Closed"],
    Paused:    ["Active", "Closed"],
    Closed:    ["Active"] // renew
};

// Helper: advance date by frequency
function addFrequencyToDate(dateStr, frequency) {
    const d = new Date(dateStr || Date.now());
    switch (frequency) {
        case "daily":
            d.setDate(d.getDate() + 1);
            break;
        case "weekly":
            d.setDate(d.getDate() + 7);
            break;
        case "yearly":
            d.setFullYear(d.getFullYear() + 1);
            break;
        case "monthly":
        default:
            d.setMonth(d.getMonth() + 1);
            break;
    }
    return d.toISOString().split("T")[0];
}

// 1. AUTOMATED BILLING RUN (Admin / Staff)
//    Scans active subscriptions, auto-generates invoices, applies discounts & taxes, prevents double-billing
router.post(
    "/billing-run",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const todayStr = new Date().toISOString().split("T")[0];

            // 1. Check auto-close on expired subscriptions whose plan has auto_close = 1
            db.prepare(`
                UPDATE subscriptions
                SET status = 'Closed', updated_at = CURRENT_TIMESTAMP
                WHERE status = 'Active'
                  AND end_date IS NOT NULL
                  AND end_date <= ?
                  AND plan_id IN (SELECT id FROM plans WHERE auto_close = 1)
            `).run(todayStr);

            // 2. Find Active subscriptions that are due for billing
            // Due if next_billing_date is NULL or next_billing_date <= today
            const dueSubscriptions = db.prepare(`
                SELECT s.*, p.name AS plan_name, p.frequency, p.price AS plan_price,
                       u.name AS customer_name, u.email AS customer_email
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                JOIN users u ON s.customer_id = u.id
                WHERE s.status = 'Active'
                  AND (s.next_billing_date IS NULL OR s.next_billing_date <= ?)
                  AND (s.end_date IS NULL OR s.end_date >= ?)
            `).all(todayStr, todayStr);

            if (dueSubscriptions.length === 0) {
                return res.status(200).json({
                    message: "Billing run completed. No subscriptions currently due for billing.",
                    invoicesCreated: 0,
                    invoices: []
                });
            }

            // Get default tax rate
            const defaultTax = db.prepare("SELECT rate FROM tax_rules WHERE is_default = 1 AND is_active = 1").get();
            const fallbackTaxRate = defaultTax ? defaultTax.rate : 0.00;

            const createdInvoices = [];

            const billingRunTx = db.transaction(() => {
                for (const sub of dueSubscriptions) {
                    // Check if already billed today to strictly enforce "Nothing should be billed twice"
                    const alreadyBilledToday = db.prepare(`
                        SELECT id FROM invoices
                        WHERE subscription_id = ?
                          AND DATE(created_at) = DATE(?)
                    `).get(sub.id, todayStr);

                    if (alreadyBilledToday) {
                        continue;
                    }

                    const items = db.prepare(`
                        SELECT si.*, pr.name AS product_name
                        FROM subscription_items si
                        JOIN products pr ON si.product_id = pr.id
                        WHERE si.subscription_id = ?
                    `).all(sub.id);

                    if (items.length === 0) {
                        continue;
                    }

                    // Compute lines and tax
                    let subtotal = 0;
                    let taxAmount = 0;
                    const lines = [];

                    for (const item of items) {
                        const taxRate = item.tax_rate != null && item.tax_rate > 0 ? item.tax_rate : fallbackTaxRate;
                        const lineSubtotal = item.quantity * item.unit_price;
                        const lineTax = lineSubtotal * (taxRate / 100);
                        const lineTotal = lineSubtotal + lineTax;

                        subtotal += lineSubtotal;
                        taxAmount += lineTax;

                        lines.push({
                            description: `${item.product_name} (${sub.plan_name})`,
                            quantity: item.quantity,
                            unit_price: item.unit_price,
                            tax_rate: taxRate,
                            line_total: lineTotal
                        });
                    }

                    // Automatic discount calculation
                    // Check active discounts matching this sub or products
                    let discountAmount = 0;
                    const activeDiscounts = db.prepare(`
                        SELECT * FROM discounts
                        WHERE valid_from <= ?
                          AND (valid_until IS NULL OR valid_until >= ?)
                          AND (usage_limit IS NULL OR times_used < usage_limit)
                    `).all(todayStr, todayStr);

                    for (const disc of activeDiscounts) {
                        if (disc.min_purchase_amount && subtotal < disc.min_purchase_amount) continue;

                        let applicable = false;
                        if (!disc.product_id || disc.applies_to === "subscription") {
                            applicable = true;
                        } else {
                            // Check if subscription has the discounted product
                            applicable = items.some(i => i.product_id === disc.product_id);
                        }

                        if (applicable) {
                            let discVal = 0;
                            if (disc.type === "fixed") {
                                discVal = disc.value;
                            } else if (disc.type === "percentage") {
                                discVal = (subtotal * disc.value) / 100;
                            }
                            discountAmount += discVal;

                            // Increment times_used
                            db.prepare("UPDATE discounts SET times_used = times_used + 1 WHERE id = ?").run(disc.id);
                        }
                    }

                    discountAmount = Math.min(discountAmount, subtotal + taxAmount);
                    const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);

                    // Due date: 15 days from today or based on payment terms
                    const dueDateObj = new Date();
                    dueDateObj.setDate(dueDateObj.getDate() + 15);
                    const dueDateStr = dueDateObj.toISOString().split("T")[0];

                    const invResult = db.prepare(`
                        INSERT INTO invoices (
                            subscription_id, status, subtotal, tax_amount, discount_amount, total_amount, due_date
                        ) VALUES (?, 'Draft', ?, ?, ?, ?, ?)
                    `).run(sub.id, subtotal, taxAmount, discountAmount, totalAmount, dueDateStr);

                    const invoiceId = invResult.lastInsertRowid;
                    const invNumber = `INV-${String(invoiceId).padStart(6, "0")}`;
                    db.prepare("UPDATE invoices SET invoice_number = ? WHERE id = ?").run(invNumber, invoiceId);

                    const insertLine = db.prepare(`
                        INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, tax_rate, line_total)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `);

                    for (const l of lines) {
                        insertLine.run(invoiceId, l.description, l.quantity, l.unit_price, l.tax_rate, l.line_total);
                    }

                    // Advance subscription next_billing_date and update last_billed_at
                    const nextBillingDate = addFrequencyToDate(sub.next_billing_date || todayStr, sub.frequency);
                    db.prepare(`
                        UPDATE subscriptions
                        SET last_billed_at = CURRENT_TIMESTAMP,
                            next_billing_date = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(nextBillingDate, sub.id);

                    createdInvoices.push({
                        invoiceId,
                        invoiceNumber: invNumber,
                        subscriptionId: sub.id,
                        customerName: sub.customer_name,
                        totalAmount
                    });
                }
            });

            billingRunTx();

            res.status(200).json({
                message: `Billing day run completed successfully. Created ${createdInvoices.length} invoices.`,
                invoicesCreated: createdInvoices.length,
                invoices: createdInvoices
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error during billing run.", error: err.message });
        }
    }
);

// 2. CREATE SUBSCRIPTION
router.post("/", authenticateToken, (req, res) => {
    try {
        const { plan_id, payment_terms, start_date, end_date, items, notes } = req.body;
        let { customer_id } = req.body;

        if (req.user.role === "customer") {
            customer_id = req.user.id;
        } else {
            if (!customer_id) customer_id = req.user.id;
        }

        if (!plan_id || !start_date) {
            return res.status(400).json({ message: "plan_id and start_date are required." });
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "At least one item is required." });
        }

        const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(plan_id);
        if (!plan) {
            return res.status(400).json({ message: "plan_id does not refer to an existing plan." });
        }

        const customer = db.prepare("SELECT id FROM users WHERE id = ?").get(customer_id);
        if (!customer) {
            return res.status(400).json({ message: "customer_id does not refer to an existing user." });
        }

        const defaultTax = db.prepare("SELECT rate FROM tax_rules WHERE is_default = 1 AND is_active = 1").get();
        const fallbackTaxRate = defaultTax ? defaultTax.rate : 0.00;

        const nextBilling = addFrequencyToDate(start_date, plan.frequency);

        const createSubscriptionTx = db.transaction(() => {
            const subResult = db.prepare(`
                INSERT INTO subscriptions (customer_id, plan_id, status, payment_terms, start_date, end_date, next_billing_date, notes)
                VALUES (?, ?, 'Draft', ?, ?, ?, ?, ?)
            `).run(
                customer_id,
                plan_id,
                payment_terms || "immediate",
                start_date,
                end_date || null,
                nextBilling,
                notes || null
            );

            const subscriptionId = subResult.lastInsertRowid;
            const subNumber = `SUB-${String(subscriptionId).padStart(5, "0")}`;
            db.prepare("UPDATE subscriptions SET subscription_number = ? WHERE id = ?").run(subNumber, subscriptionId);

            const insertItem = db.prepare(`
                INSERT INTO subscription_items (subscription_id, product_id, variant_id, quantity, unit_price, tax_rate, tax_amount, line_total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const item of items) {
                const qty = parseInt(item.quantity) || 1;
                const unitPrice = parseFloat(item.unit_price) || 0.00;
                const taxRate = item.tax_rate != null ? parseFloat(item.tax_rate) : fallbackTaxRate;
                const subtotal = qty * unitPrice;
                const taxAmount = subtotal * (taxRate / 100);
                const lineTotal = subtotal + taxAmount;

                insertItem.run(
                    subscriptionId,
                    item.product_id,
                    item.variant_id || null,
                    qty,
                    unitPrice,
                    taxRate,
                    taxAmount,
                    lineTotal
                );
            }

            return subscriptionId;
        });

        const subscriptionId = createSubscriptionTx();
        const subscription = db.prepare(`
            SELECT s.*, p.name AS plan_name, p.frequency, u.name AS customer_name, u.email AS customer_email
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            JOIN users u ON s.customer_id = u.id
            WHERE s.id = ?
        `).get(subscriptionId);

        const createdItems = db.prepare(`
            SELECT si.*, pr.name AS product_name, pv.variant_name
            FROM subscription_items si
            JOIN products pr ON si.product_id = pr.id
            LEFT JOIN product_variants pv ON si.variant_id = pv.id
            WHERE si.subscription_id = ?
        `).all(subscriptionId);

        return res.status(201).json({ message: "Subscription created successfully.", data: { ...subscription, items: createdItems } });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while creating subscription.", error: err.message });
    }
});

// 3. GET ALL SUBSCRIPTIONS
router.get("/", authenticateToken, (req, res) => {
    try {
        let rows;
        if (req.user.role === "customer") {
            rows = db.prepare(`
                SELECT s.*, p.name AS plan_name, p.frequency, p.allow_pause, p.allow_renew, p.allow_close_early,
                       u.name AS customer_name, u.email AS customer_email
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                JOIN users u ON s.customer_id = u.id
                WHERE s.customer_id = ?
                ORDER BY s.created_at DESC
            `).all(req.user.id);
        } else {
            rows = db.prepare(`
                SELECT s.*, p.name AS plan_name, p.frequency, p.allow_pause, p.allow_renew, p.allow_close_early,
                       u.name AS customer_name, u.email AS customer_email
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                JOIN users u ON s.customer_id = u.id
                ORDER BY s.created_at DESC
            `).all();
        }

        return res.status(200).json({ message: "Subscriptions retrieved.", data: rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while listing subscriptions.", error: err.message });
    }
});

// 4. GET SINGLE SUBSCRIPTION WITH ITEMS
router.get("/:id", authenticateToken, (req, res) => {
    try {
        const subscription = db.prepare(`
            SELECT s.*, p.name AS plan_name, p.frequency, p.allow_pause, p.allow_renew, p.allow_close_early,
                   u.name AS customer_name, u.email AS customer_email
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            JOIN users u ON s.customer_id = u.id
            WHERE s.id = ?
        `).get(req.params.id);

        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found." });
        }

        if (req.user.role === "customer" && subscription.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        const items = db.prepare(`
            SELECT si.*, pr.name AS product_name, pv.variant_name
            FROM subscription_items si
            JOIN products pr ON si.product_id = pr.id
            LEFT JOIN product_variants pv ON si.variant_id = pv.id
            WHERE si.subscription_id = ?
        `).all(req.params.id);

        return res.status(200).json({ message: "Subscription retrieved.", data: { ...subscription, items } });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Server error while fetching subscription.", error: err.message });
    }
});

// 5. UPDATE SUBSCRIPTION STATUS
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

            const subscription = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
            if (!subscription) {
                return res.status(404).json({ message: "Subscription not found." });
            }

            const allowed = STATUS_TRANSITIONS[subscription.status] || [];
            if (!allowed.includes(status) && status !== subscription.status) {
                return res.status(400).json({
                    message: `Invalid transition from '${subscription.status}' to '${status}'. Allowed: ${allowed.join(", ") || "None"}.`
                });
            }

            db.prepare(`
                UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).run(status, req.params.id);

            const updated = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
            return res.status(200).json({ message: "Subscription status updated.", data: updated });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Server error while updating status.", error: err.message });
        }
    }
);

// 6. PAUSE SUBSCRIPTION (Plan must allow pausing; admin/staff or owner customer)
router.post("/:id/pause", authenticateToken, (req, res) => {
    try {
        const sub = db.prepare(`
            SELECT s.*, p.allow_pause
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.id = ?
        `).get(req.params.id);

        if (!sub) return res.status(404).json({ message: "Subscription not found." });
        if (req.user.role === "customer" && sub.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        if (sub.status !== "Active") {
            return res.status(400).json({ message: "Only Active subscriptions can be paused." });
        }

        if (sub.allow_pause === 0) {
            return res.status(400).json({ message: "This plan does not permit pausing." });
        }

        db.prepare("UPDATE subscriptions SET status = 'Paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
        const updated = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
        res.json({ message: "Subscription paused successfully.", data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error pausing subscription.", error: err.message });
    }
});

// 7. RESUME SUBSCRIPTION
router.post("/:id/resume", authenticateToken, (req, res) => {
    try {
        const sub = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
        if (!sub) return res.status(404).json({ message: "Subscription not found." });
        if (req.user.role === "customer" && sub.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        if (sub.status !== "Paused") {
            return res.status(400).json({ message: "Only Paused subscriptions can be resumed." });
        }

        db.prepare("UPDATE subscriptions SET status = 'Active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
        const updated = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
        res.json({ message: "Subscription resumed successfully.", data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error resuming subscription.", error: err.message });
    }
});

// 8. RENEW SUBSCRIPTION
router.post("/:id/renew", authenticateToken, (req, res) => {
    try {
        const sub = db.prepare(`
            SELECT s.*, p.frequency, p.allow_renew
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.id = ?
        `).get(req.params.id);

        if (!sub) return res.status(404).json({ message: "Subscription not found." });
        if (req.user.role === "customer" && sub.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        if (sub.allow_renew === 0) {
            return res.status(400).json({ message: "This plan does not permit renewal." });
        }

        const baseDate = sub.end_date && new Date(sub.end_date) > new Date() ? sub.end_date : new Date().toISOString().split("T")[0];
        const newEndDate = addFrequencyToDate(baseDate, sub.frequency);

        db.prepare(`
            UPDATE subscriptions
            SET end_date = ?, status = 'Active', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(newEndDate, req.params.id);

        const updated = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
        res.json({ message: "Subscription renewed successfully.", data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error renewing subscription.", error: err.message });
    }
});

// 9. CLOSE EARLY
router.post("/:id/close", authenticateToken, (req, res) => {
    try {
        const sub = db.prepare(`
            SELECT s.*, p.allow_close_early
            FROM subscriptions s
            JOIN plans p ON s.plan_id = p.id
            WHERE s.id = ?
        `).get(req.params.id);

        if (!sub) return res.status(404).json({ message: "Subscription not found." });
        if (req.user.role === "customer" && sub.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Access denied." });
        }

        if (sub.status === "Closed") {
            return res.status(400).json({ message: "Subscription is already closed." });
        }

        if (sub.allow_close_early === 0) {
            return res.status(400).json({ message: "This plan does not permit early closure." });
        }

        db.prepare("UPDATE subscriptions SET status = 'Closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
        const updated = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
        res.json({ message: "Subscription closed successfully.", data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error closing subscription.", error: err.message });
    }
});

// 10. DELETE SUBSCRIPTION (Draft only, admin only)
router.delete(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    (req, res) => {
        try {
            const subscription = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
            if (!subscription) {
                return res.status(404).json({ message: "Subscription not found." });
            }

            if (subscription.status !== "Draft") {
                return res.status(400).json({
                    message: `Cannot delete a subscription with status '${subscription.status}'. Only 'Draft' subscriptions can be deleted.`
                });
            }

            db.prepare("DELETE FROM subscriptions WHERE id = ?").run(req.params.id);
            return res.status(200).json({ message: "Subscription deleted successfully." });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ message: "Server error while deleting subscription.", error: err.message });
        }
    }
);

module.exports = router;
