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
            const variants = db.prepare("SELECT * FROM product_variants WHERE product_id = ?").all(productId);

            res.status(201).json({
                message: "Product created successfully!",
                product: { ...product, variants }
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Server error while creating product." });
        }
    }
);

// 2. GET ALL PRODUCTS (with variants)
router.get("/", authenticateToken, (req, res) => {
    try {
        const products = db.prepare("SELECT * FROM products ORDER BY name ASC").all();
        const allVariants = db.prepare("SELECT * FROM product_variants").all();

        const productsWithVariants = products.map(p => ({
            ...p,
            variants: allVariants.filter(v => v.product_id === p.id)
        }));

        res.status(200).json(productsWithVariants);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while fetching products." });
    }
});

// 3. GET PLANS (must come before /:id)
router.get("/plans", authenticateToken, (req, res) => {
    try {
        const plans = db.prepare("SELECT * FROM plans ORDER BY created_at DESC").all();
        res.status(200).json(plans);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while fetching plans." });
    }
});

// 4. CREATE A RECURRING BILLING PLAN
//    Body: { name, frequency, price?, minimum_quantity?, start_date, end_date?, auto_close?, allow_pause?, allow_renew?, allow_close_early? }
router.post(
    "/plans",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const {
                name,
                frequency,
                price,
                minimum_quantity,
                start_date,
                end_date,
                auto_close,
                allow_pause,
                allow_renew,
                allow_close_early
            } = req.body;

            if (!name || !frequency || !start_date) {
                return res.status(400).json({ message: "name, frequency and start_date are required." });
            }

            const validFrequencies = ["daily", "weekly", "monthly", "yearly"];
            if (!validFrequencies.includes(frequency)) {
                return res.status(400).json({ message: `frequency must be one of: ${validFrequencies.join(", ")}` });
            }

            const result = db.prepare(`
                INSERT INTO plans (name, frequency, price, minimum_quantity, start_date, end_date, auto_close, allow_pause, allow_renew, allow_close_early)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                name.trim(),
                frequency,
                parseFloat(price) || 0.00,
                minimum_quantity || 1,
                start_date,
                end_date || null,
                auto_close ? 1 : 0,
                allow_pause === false ? 0 : 1,
                allow_renew === false ? 0 : 1,
                allow_close_early === false ? 0 : 1
            );

            const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(result.lastInsertRowid);

            res.status(201).json({ message: "Billing plan created!", plan });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Server error while creating plan." });
        }
    }
);

// 5. GET ALL DISCOUNTS (must come before /:id)
router.get("/discounts", authenticateToken, (req, res) => {
    try {
        const discounts = db.prepare(`
            SELECT d.*, p.name AS product_name
            FROM discounts d
            LEFT JOIN products p ON d.product_id = p.id
            ORDER BY d.created_at DESC
        `).all();
        res.status(200).json(discounts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error while fetching discounts." });
    }
});

// 6. CREATE A DISCOUNT RULE
//    Body: { code?, type, value, min_purchase_amount?, min_quantity?, usage_limit?, valid_from, valid_until?, product_id?, applies_to? }
router.post(
    "/discounts",
    authenticateToken,
    authorizeRoles("admin"),
    (req, res) => {
        try {
            const {
                code,
                type,
                value,
                min_purchase_amount,
                min_quantity,
                usage_limit,
                valid_from,
                valid_until,
                product_id,
                applies_to
            } = req.body;

            if (!type || value == null || !valid_from) {
                return res.status(400).json({ message: "type, value and valid_from are required." });
            }

            const validTypes = ["fixed", "percentage"];
            if (!validTypes.includes(type)) {
                return res.status(400).json({ message: `type must be one of: ${validTypes.join(", ")}` });
            }

            const result = db.prepare(`
                INSERT INTO discounts (code, type, value, min_purchase_amount, min_quantity, usage_limit, valid_from, valid_until, product_id, applies_to)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                code || null,
                type,
                parseFloat(value),
                min_purchase_amount || 0,
                min_quantity || 1,
                usage_limit || null,
                valid_from,
                valid_until || null,
                product_id || null,
                applies_to || (product_id ? "product" : "subscription")
            );

            const discount = db.prepare("SELECT * FROM discounts WHERE id = ?").get(result.lastInsertRowid);

            res.status(201).json({ message: "Discount rule created!", discount });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Server error while creating discount." });
        }
    }
);

// 7. GET SINGLE PRODUCT BY ID
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

// 8. ADD A VARIANT TO AN EXISTING PRODUCT
router.post(
    "/:id/variants",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const { variant_name, price_modifier, cost_modifier } = req.body;
            if (!variant_name) {
                return res.status(400).json({ message: "variant_name is required." });
            }

            const product = db.prepare("SELECT id FROM products WHERE id = ?").get(req.params.id);
            if (!product) {
                return res.status(404).json({ message: "Product not found." });
            }

            const result = db.prepare(`
                INSERT INTO product_variants (product_id, variant_name, price_modifier, cost_modifier)
                VALUES (?, ?, ?, ?)
            `).run(req.params.id, variant_name.trim(), parseFloat(price_modifier) || 0.00, parseFloat(cost_modifier) || 0.00);

            const newVariant = db.prepare("SELECT * FROM product_variants WHERE id = ?").get(result.lastInsertRowid);
            res.status(201).json({ message: "Variant added successfully!", variant: newVariant });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Server error while adding variant." });
        }
    }
);

module.exports = router;
