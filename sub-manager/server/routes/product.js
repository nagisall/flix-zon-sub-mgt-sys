const express = require('express');
const router = express.Router();
const db = require('../db'); // Connects to your database file (db.js)

// 1. CREATE A PRODUCT & OPTIONAL VARIANT (e.g., Odoo brand +560 modifier)
router.post('/', async (req, res) => {
    try {
        const { name, type, sales_price, cost_price, notes, variant_name, price_modifier } = req.body;

        // Insert into products table
        const productQuery = `
            INSERT INTO products (name, type, sales_price, cost_price, notes) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const productValues = [name, type, sales_price, cost_price, notes];
        const newProduct = await db.query(productQuery, productValues);
        const productId = newProduct.rows[0].id;

        // If a variant is provided (like a brand add-on), save it too
        if (variant_name) {
            const variantQuery = `
                INSERT INTO product_variants (product_id, variant_name, price_modifier) 
                VALUES ($1, $2, $3) RETURNING *;
            `;
            await db.query(variantQuery, [productId, variant_name, price_modifier || 0.00]);
        }

        res.status(201).json({ 
            message: "Product created successfully!", 
            product: newProduct.rows[0] 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while creating product." });
    }
});

// 2. GET ALL PRODUCTS (For the catalog view)
router.get('/', async (req, res) => {
    try {
        const allProducts = await db.query('SELECT * FROM products;');
        res.status(200).json(allProducts.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while fetching products." });
    }
});

// 3. CREATE A RECURRING BILLING PLAN (daily, weekly, monthly, yearly)
router.post('/plans', async (req, res) => {
    try {
        const { product_id, name, frequency, minimum_quantity, start_date, end_date } = req.body;

        const planQuery = `
            INSERT INTO plans (product_id, name, frequency, minimum_quantity, start_date, end_date) 
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
        `;
        const newPlan = await db.query(planQuery, [product_id, name, frequency, minimum_quantity || 1, start_date, end_date]);

        res.status(201).json({ message: "Billing plan created!", plan: newPlan.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while creating plan." });
    }
});

// 4. CREATE A DISCOUNT RULE (fixed or percentage)
router.post('/discounts', async (req, res) => {
    try {
        const { code, type, value, min_purchase_amount, usage_limit, valid_from, valid_until } = req.body;

        const discountQuery = `
            INSERT INTO discounts (code, type, value, min_purchase_amount, usage_limit, valid_from, valid_until) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;
        `;
        const newDiscount = await db.query(discountQuery, [code, type, value, min_purchase_amount || 0, usage_limit, valid_from, valid_until]);

        res.status(201).json({ message: "Discount rule created!", discount: newDiscount.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while creating discount." });
    }
});

module.exports = router;