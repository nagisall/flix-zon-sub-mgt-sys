
require("dotenv").config();

const bcrypt = require("bcryptjs");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const db = require("./config/database");

const rl = readline.createInterface({ input: stdin, output: stdout });

async function createAdmin() {
    try {
        // Prevent creating another admin through this setup script
        const existingAdmin = db.prepare(
            "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        ).get();

        if (existingAdmin) {
            console.log("An admin account already exists.");
            return;
        }

        const name = (await rl.question("Admin name: ")).trim();
        const email = (await rl.question("Admin email: "))
            .trim().toLowerCase();
        const password = await rl.question("Admin password: ");

        if (!name || !email || !password) {
            console.log("All fields are required.");
            return;
        }

        const validPassword =
            password.length > 8 &&
            /[A-Z]/.test(password) &&
            /[a-z]/.test(password) &&
            /[^A-Za-z0-9]/.test(password);

        if (!validPassword) {
            console.log("Password does not meet security requirements.");
            return;
        }

        const existingUser = db.prepare(
            "SELECT id FROM users WHERE email = ?"
        ).get(email);

        if (existingUser) {
            console.log("This email is already registered.");
            return;
        }

        const hash = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO users (name, email, password_hash, role)
            VALUES (?, ?, ?, 'admin')
        `).run(name, email, hash);

        console.log("Admin account created successfully!");

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        rl.close();
        db.close();
    }
}

createAdmin();
