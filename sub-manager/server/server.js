require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const productRoutes = require("./routes/product");
const subscriptionRoutes = require("./routes/subscriptions");
const invoiceRoutes = require("./routes/invoices");
const paymentRoutes = require("./routes/payments");
const taxRoutes = require("./routes/taxes");
const quotationTemplateRoutes = require("./routes/quotationTemplates");
const analyticsRoutes = require("./routes/analytics");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20kb" }));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: "draft-8",
    legacyHeaders: false
});

app.get("/api/health", (req, res) => {
    res.json({
        message: "Brightloop Subscription Management Server is running!",
        timestamp: new Date().toISOString()
    });
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/products", productRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/taxes", taxRoutes);
app.use("/api/quotation-templates", quotationTemplateRoutes);
app.use("/api/analytics", analyticsRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Brightloop Subscription Management Server running on port ${PORT}`);
});
