const express = require("express");
const router = express.Router();
const db = require("../config/database");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

// 1. GET ALL TAX RULES
router.get("/", authenticateToken, (req, res) => {
    try {
        const taxes = db.prepare("SELECT * FROM tax_rules ORDER BY is_default DESC, name ASC").all();
        res.status(200).json({ message: "Tax rules retrieved.", data: taxes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error fetching tax rules.", error: err.message });
    }
});

// 2. CREATE A TAX RULE (admin only)
router.post(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    (req, res) => {
        try {
            const { name, rate, is_default, is_active } = req.body;

            if (!name || rate == null) {
                return res.status(400).json({ message: "name and rate are required." });
            }

            const taxRate = parseFloat(rate);
            if (isNaN(taxRate) || taxRate < 0) {
                return res.status(400).json({ message: "rate must be a non-negative number." });
            }

            const createTax = db.transaction(() => {
                if (is_default) {
                    db.prepare("UPDATE tax_rules SET is_default = 0").run();
                }

                const result = db.prepare(`
                    INSERT INTO tax_rules (name, rate, is_default, is_active)
                    VALUES (?, ?, ?, ?)
                `).run(
                    name.trim(),
                    taxRate,
                    is_default ? 1 : 0,
                    is_active === false ? 0 : 1
                );

                return db.prepare("SELECT * FROM tax_rules WHERE id = ?").get(result.lastInsertRowid);
            });

            const newTax = createTax();
            res.status(201).json({ message: "Tax rule created successfully.", data: newTax });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error creating tax rule.", error: err.message });
        }
    }
);

// 3. UPDATE A TAX RULE (admin only)
router.put(
    "/:id",
    authenticateToken,
    authorizeRoles("admin"),
    (req, res) => {
        try {
            const { name, rate, is_default, is_active } = req.body;

            const existing = db.prepare("SELECT * FROM tax_rules WHERE id = ?").get(req.params.id);
            if (!existing) {
                return res.status(404).json({ message: "Tax rule not found." });
            }

            const updateTax = db.transaction(() => {
                if (is_default) {
                    db.prepare("UPDATE tax_rules SET is_default = 0").run();
                }

                db.prepare(`
                    UPDATE tax_rules
                    SET name = ?, rate = ?, is_default = ?, is_active = ?
                    WHERE id = ?
                `).run(
                    name !== undefined ? name.trim() : existing.name,
                    rate !== undefined ? parseFloat(rate) : existing.rate,
                    is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default,
                    is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
                    req.params.id
                );

                return db.prepare("SELECT * FROM tax_rules WHERE id = ?").get(req.params.id);
            });

            const updated = updateTax();
            res.status(200).json({ message: "Tax rule updated successfully.", data: updated });
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error updating tax rule.", error: err.message });
        }
    }
);

module.exports = router;
