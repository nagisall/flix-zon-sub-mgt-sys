const express = require("express");
const router = express.Router();
const db = require("../config/database");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");

// GET /api/analytics — Finance Lead Analytics Dashboard (admin & staff only)
router.get(
    "/",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { from, to, plan_id, customer_id } = req.query;
            const todayStr = new Date().toISOString().split("T")[0];

            // 1. Subscription Counts & Breakdown
            let subWhere = [];
            let subParams = [];
            if (plan_id) {
                subWhere.push("s.plan_id = ?");
                subParams.push(plan_id);
            }
            if (customer_id) {
                subWhere.push("s.customer_id = ?");
                subParams.push(customer_id);
            }
            const subWhereClause = subWhere.length > 0 ? "WHERE " + subWhere.join(" AND ") : "";

            const statusCounts = db.prepare(`
                SELECT status, COUNT(*) AS count
                FROM subscriptions s
                ${subWhereClause}
                GROUP BY status
            `).all(...subParams);

            const statusMap = { Active: 0, Paused: 0, Quotation: 0, Confirmed: 0, Draft: 0, Closed: 0 };
            let totalSubs = 0;
            for (const row of statusCounts) {
                statusMap[row.status] = row.count;
                totalSubs += row.count;
            }

            // 2. Revenue Collected (Payments)
            let payWhere = [];
            let payParams = [];
            if (from) {
                payWhere.push("DATE(p.payment_date) >= DATE(?)");
                payParams.push(from);
            }
            if (to) {
                payWhere.push("DATE(p.payment_date) <= DATE(?)");
                payParams.push(to);
            }
            const payWhereClause = payWhere.length > 0 ? "WHERE " + payWhere.join(" AND ") : "";

            const revenueRow = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) AS total_revenue, COUNT(*) AS payment_count
                FROM payments p
                ${payWhereClause}
            `).get(...payParams);

            // 3. Outstanding Balance (Confirmed / Draft invoices)
            const outstandingRow = db.prepare(`
                SELECT
                    COALESCE(SUM(total_amount - paid_amount), 0) AS total_outstanding,
                    COUNT(*) AS unpaid_count
                FROM invoices
                WHERE status IN ('Draft', 'Confirmed')
            `).get();

            // 4. Overdue Invoices (due_date < today AND status not in 'Paid', 'Cancelled')
            const overdueRow = db.prepare(`
                SELECT
                    COUNT(*) AS count,
                    COALESCE(SUM(total_amount - paid_amount), 0) AS amount
                FROM invoices
                WHERE due_date < ?
                  AND status NOT IN ('Paid', 'Cancelled')
            `).get(todayStr);

            const overdueInvoices = db.prepare(`
                SELECT i.*, s.subscription_number,
                       u.name AS customer_name, u.email AS customer_email,
                       (i.total_amount - i.paid_amount) AS balance_due,
                       ROUND(JULIANDAY(?) - JULIANDAY(i.due_date)) AS days_overdue
                FROM invoices i
                JOIN subscriptions s ON i.subscription_id = s.id
                JOIN users u ON s.customer_id = u.id
                WHERE i.due_date < ?
                  AND i.status NOT IN ('Paid', 'Cancelled')
                ORDER BY i.due_date ASC
                LIMIT 50
            `).all(todayStr, todayStr);

            // 5. Monthly Recurring Revenue (MRR) Calculation
            const activeSubs = db.prepare(`
                SELECT s.id, p.frequency,
                       COALESCE(SUM(si.line_total), 0) AS sub_total
                FROM subscriptions s
                JOIN plans p ON s.plan_id = p.id
                LEFT JOIN subscription_items si ON s.id = si.subscription_id
                WHERE s.status = 'Active'
                GROUP BY s.id, p.frequency
            `).all();

            let mrr = 0;
            for (const sub of activeSubs) {
                const total = sub.sub_total || 0;
                switch (sub.frequency) {
                    case "daily":
                        mrr += total * 30;
                        break;
                    case "weekly":
                        mrr += total * 4.33;
                        break;
                    case "monthly":
                        mrr += total;
                        break;
                    case "yearly":
                        mrr += total / 12;
                        break;
                    default:
                        mrr += total;
                }
            }

            // 6. Recent Payments
            const recentPayments = db.prepare(`
                SELECT p.*, i.invoice_number, u.name AS customer_name
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                JOIN subscriptions s ON i.subscription_id = s.id
                JOIN users u ON s.customer_id = u.id
                ORDER BY p.payment_date DESC
                LIMIT 10
            `).all();

            res.status(200).json({
                message: "Analytics retrieved successfully.",
                data: {
                    summary: {
                        activeSubscriptions: statusMap.Active || 0,
                        totalSubscriptions: totalSubs,
                        subscriptionsByStatus: statusMap,
                        revenueCollected: revenueRow.total_revenue,
                        paymentCount: revenueRow.payment_count,
                        outstandingBalance: outstandingRow.total_outstanding,
                        unpaidInvoiceCount: outstandingRow.unpaid_count,
                        overdueInvoicesCount: overdueRow.count,
                        overdueInvoicesAmount: overdueRow.amount,
                        mrr: Math.round(mrr * 100) / 100
                    },
                    overdueInvoices,
                    recentPayments
                }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error fetching analytics.", error: err.message });
        }
    }
);

module.exports = router;
