
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../config/database");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

const router = express.Router();

function validPassword(password) {
    return (
        password &&
        password.length > 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}

// Only admins can create staff accounts
router.post(
    "/staff",
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const { name, email, password } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({
                    message: "All fields are required"
                });
            }

            if (!validPassword(password)) {
                return res.status(400).json({
                    message: "Password does not meet security requirements"
                });
            }

            const cleanEmail = email.trim().toLowerCase();

            const existing = db.prepare(
                "SELECT id FROM users WHERE email = ?"
            ).get(cleanEmail);

            if (existing) {
                return res.status(409).json({
                    message: "Email already registered"
                });
            }

            const passwordHash = await bcrypt.hash(password, 12);

            const result = db.prepare(`
                INSERT INTO users
                (name, email, password_hash, role, created_by)
                VALUES (?, ?, ?, 'staff', ?)
            `).run(
                name.trim(),
                cleanEmail,
                passwordHash,
                req.user.id
            );

            res.status(201).json({
                message: "Staff account created successfully",
                staffId: result.lastInsertRowid
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message: "Unable to create staff account"
            });
        }
    }
);

// Get all staff (admin only)
router.get(
    "/staff",
    authenticateToken,
    authorizeRoles("admin"),
    (req, res) => {
        try {
            const staff = db.prepare(`
                SELECT id, name, email, role, is_active, created_at
                FROM users
                WHERE role = 'staff'
                ORDER BY created_at DESC
            `).all();
            res.json({ message: "Staff retrieved successfully", data: staff });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching staff members" });
        }
    }
);

// Get all customers (admin & staff)
router.get(
    "/customers",
    authenticateToken,
    authorizeRoles("admin", "staff"),
    (req, res) => {
        try {
            const customers = db.prepare(`
                SELECT id, name, email, role, is_active, created_at
                FROM users
                WHERE role = 'customer' AND is_active = 1
                ORDER BY name ASC
            `).all();
            res.json({ message: "Customers retrieved successfully", data: customers });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching customers" });
        }
    }
);

// Get all users (admin only)
router.get(
    "/",
    authenticateToken,
    authorizeRoles("admin"),
    (req, res) => {
        try {
            const { role } = req.query;
            let query = "SELECT id, name, email, role, is_active, created_at FROM users";
            const params = [];
            if (role) {
                query += " WHERE role = ?";
                params.push(role);
            }
            query += " ORDER BY created_at DESC";
            const users = db.prepare(query).all(...params);
            res.json({ message: "Users retrieved successfully", data: users });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching users" });
        }
    }
);

module.exports = router;
