const jwt = require("jsonwebtoken");
const db = require("../config/database");

function authenticateToken(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Login required" });
    }

    try {
        const token = header.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = db.prepare(
            "SELECT id, name, email, role, is_active FROM users WHERE id = ?"
        ).get(decoded.id);

        if (!user || user.is_active !== 1) {
            return res.status(401).json({ message: "Account unavailable" });
        }

        req.user = user;
        next();

    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Login required" });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Access denied" });
        }

        next();
    };
}

module.exports = { authenticateToken, authorizeRoles };
