// Import Product Routes
const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10kb" }));

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
app.use("/api/users", usersRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
