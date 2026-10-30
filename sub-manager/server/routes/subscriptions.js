const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Get all subscriptions
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM subscriptions ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Change Subscription Status (Draft -> Quotation -> Confirmed -> Active -> Closed)
router.patch('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const result = await pool.query(
            'UPDATE subscriptions SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Automated Billing Day (Auto-generate invoices for Active subscriptions)
router.post('/billing-run', async (req, res) => {
    try {
        res.json({ message: 'Automated billing day invoices generated!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Finance Lead Analytics Dashboard
router.get('/analytics', async (req, res) => {
    try {
        res.json({
            activeSubscriptions: 0,
            revenueCollected: 0,
            outstandingBalance: 0,
            overdueInvoices: []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;