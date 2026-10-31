
require("dotenv").config();

const bcrypt = require("bcryptjs");
const readline = require("readline/promises");
const db = require("./config/database");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function resetPassword() {
    try {
        const email = (await rl.question("Admin email: "))
            .trim().toLowerCase();

        const password = await rl.question("New password: ");

        if (
            password.length <= 8 ||
            !/[A-Z]/.test(password) ||
            !/[a-z]/.test(password) ||
            !/[^A-Za-z0-9]/.test(password)
        ) {
            console.log("Password does not meet requirements.");
            return;
        }

        const user = db.prepare(
            "SELECT id FROM users WHERE email = ? AND role = 'admin'"
        ).get(email);

        if (!user) {
            console.log("Admin account not found.");
            return;
        }

        const hash = await bcrypt.hash(password, 12);

        db.prepare(
            "UPDATE users SET password_hash = ? WHERE id = ?"
        ).run(hash, user.id);

        console.log("Admin password updated successfully!");

    } finally {
        rl.close();
        db.close();
    }
}

resetPassword();
