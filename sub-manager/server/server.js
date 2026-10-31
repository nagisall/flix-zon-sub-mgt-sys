
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10kb" }));

// Protect authentication endpoints against excessive requests
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false
});

app.get("/api/health", (req, res) => {
    res.json({ message: "Server is running!" });
});

app.use("/api/auth", authLimiter, authRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
