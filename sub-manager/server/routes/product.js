const express = require("express");
const router = express.Router();
const db = require("../config/database");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

// 1. CREATE A PRODUCT & OPTIONAL VARIANT
//    Body: { name, type, sales_price, cost_price, notes?, variant_name?, price_modifier? }
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { name, type, sales_price, cost_price, notes, variant_name, price_modifier } = req.body;

            if (!name || !type || sales_price == null || cost_price == null) {
                return res.status(400).json({ message: "name, type, sales_price and cost_price are required." });
            }

            const insertProduct = db.prepare(`
                INSERT INTO products (name, type, sales_price, cost_price, notes)
                VALUES (?, ?, ?, ?, ?)
            `);

            const result = insertProduct.run(
                name.trim(),
                type.trim(),
                sales_price,
                cost_price,
                notes || null
            );

            const productId = result.lastInsertRowid;

            if (variant_name) {
                db.prepare(`
                    INSERT INTO product_variants (product_id, variant_name, price_modifier)
                    VALUES (?, ?, ?)
                `).run(productId, variant_name.trim(), price_modifier || 0.00);
            }

            const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);

            res.status(201).json({
                message: "Product created successfully!",
                product
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Server error while creating product." });
        }
    }
);

// 2. GET ALL PRODUCTS
router.get("/", authenticateToken, (req, res) => {
    try {
        const products = db.prepare("SELECT * FROM products").all();
        res.status(200).json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while fetching products." });
    }
});

// 3. GET SINGLE PRODUCT BY ID
router.get("/:id", authenticateToken, (req, res) => {
    try {
        const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }
        const variants = db.prepare("SELECT * FROM product_variants WHERE product_id = ?").all(req.params.id);
        res.status(200).json({ ...product, variants });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while fetching product." });
    }
});

// 4. CREATE A RECURRING BILLING PLAN
//    Body: { name, frequency, minimum_quantity?, start_date, end_date? }
router.post(
    "/plans",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { name, frequency, minimum_quantity, start_date, end_date } = req.body;

            if (!name || !frequency || !start_date) {
                return res.status(400).json({ message: "name, frequency and start_date are required." });
            }

            const validFrequencies = ["daily", "weekly", "monthly", "yearly"];
            if (!validFrequencies.includes(frequency)) {
                return res.status(400).json({ message: `frequency must be one of: ${validFrequencies.join(", ")}` });
            }

            const result = db.prepare(`
                INSERT INTO plans (name, frequency, minimum_quantity, start_date, end_date)
                VALUES (?, ?, ?, ?, ?)
            `).run(name.trim(), frequency, minimum_quantity || 1, start_date, end_date || null);

            const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(result.lastInsertRowid);

            res.status(201).json({ message: "Billing plan created!", plan });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Server error while creating plan." });
        }
    }
);

// 5. CREATE A DISCOUNT RULE
//    Body: { code?, type, value, min_purchase_amount?, usage_limit?, valid_from, valid_until? }
router.post(
    "/discounts",
    authenticateToken,
    authorizeRoles("admin"),
    (req, res) => {
        try {
            const { code, type, value, min_purchase_amount, usage_limit, valid_from, valid_until } = req.body;

            if (!type || value == null || !valid_from) {
                return res.status(400).json({ message: "type, value and valid_from are required." });
            }

            const validTypes = ["fixed", "percentage"];
            if (!validTypes.includes(type)) {
                return res.status(400).json({ message: `type must be one of: ${validTypes.join(", ")}` });
            }

            const result = db.prepare(`
                INSERT INTO discounts (code, type, value, min_purchase_amount, usage_limit, valid_from, valid_until)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                code || null,
                type,
                value,
                min_purchase_amount || 0,
                usage_limit || null,
                valid_from,
                valid_until || null
            );

            const discount = db.prepare("SELECT * FROM discounts WHERE id = ?").get(result.lastInsertRowid);

            res.status(201).json({ message: "Discount rule created!", discount });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Server error while creating discount." });
        }
    }
);

module.exports = router;
