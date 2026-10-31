
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

// Password validation
function validPassword(password) {
    return (
        password &&
        password.length > 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}

// USER SIGNUP
router.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        if (!validPassword(password)) {
            return res.status(400).json({
                message: "Password must be longer than 8 characters and contain uppercase, lowercase and special characters"
            });
        }

        const existingUser = db.prepare(
            "SELECT id FROM users WHERE email = ?"
        ).get(email.trim().toLowerCase());

        if (existingUser) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = db.prepare(`
            INSERT INTO users (name, email, password_hash, role)
            VALUES (?, ?, ?, 'customer')
        `).run(name.trim(), email.trim().toLowerCase(), passwordHash);

        res.status(201).json({
            message: "Account created successfully",
            userId: result.lastInsertRowid
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Signup failed"
        });
    }
});

// USER LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password required"
            });
        }

        const user = db.prepare(
            "SELECT * FROM users WHERE email = ?"
        ).get(email.trim().toLowerCase());

        if (!user || !user.is_active) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const valid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!valid) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured");
        }

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Login failed"
        });
    }
});

// FORGOT PASSWORD — Send / generate reset link
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = db.prepare("SELECT id, email, name FROM users WHERE email = ?").get(cleanEmail);

        if (!user) {
            // Return success message so as not to leak registered emails
            return res.status(200).json({
                message: "If that email is registered, a password reset link has been generated."
            });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

        db.prepare(`
            INSERT INTO password_resets (email, token, expires_at)
            VALUES (?, ?, ?)
        `).run(cleanEmail, token, expiresAt);

        // In production this would be emailed; in dev we return the token & simulated link
        return res.status(200).json({
            message: "Password reset link generated and sent to registered email.",
            resetToken: token,
            resetLink: `/reset-password?token=${token}`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error requesting password reset." });
    }
});

// RESET PASSWORD — Verify token and update password
router.post("/reset-password", async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ message: "Token and new password are required." });
        }

        if (!validPassword(password)) {
            return res.status(400).json({
                message: "Password must be longer than 8 characters and contain uppercase, lowercase and special characters."
            });
        }

        const resetRecord = db.prepare(`
            SELECT * FROM password_resets
            WHERE token = ? AND used = 0
        `).get(token);

        if (!resetRecord) {
            return res.status(400).json({ message: "Invalid or already used reset token." });
        }

        if (new Date(resetRecord.expires_at) < new Date()) {
            return res.status(400).json({ message: "Reset token has expired. Please request a new one." });
        }

        const newHash = await bcrypt.hash(password, 12);

        const resetTx = db.transaction(() => {
            db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(newHash, resetRecord.email);
            db.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(resetRecord.id);
        });

        resetTx();

        res.status(200).json({ message: "Password has been reset successfully. You can now log in." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error resetting password." });
    }
});

// CURRENT LOGGED IN USER
router.get("/me", authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// DEMO SWITCHER LOGIN (Instant 1-click switch by role for demo mode)
router.post("/demo-login", (req, res) => {
    try {
        const { role } = req.body;
        const targetRole = role || "admin";
        const emailMap = {
            admin: "admin@brightloop.io",
            staff: "staff@brightloop.io",
            customer: "customer@brightloop.io"
        };
        const email = emailMap[targetRole] || "admin@brightloop.io";

        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        if (!user) {
            return res.status(404).json({ message: "Demo account not found" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "24h" }
        );

        res.json({
            message: `Switched to ${user.role} mode`,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Demo login failed" });
    }
});

module.exports = router;
