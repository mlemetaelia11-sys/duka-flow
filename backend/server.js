"use strict";

require("dotenv").config();
const {validateProductionEnv}=require("./config/validateEnv");validateProductionEnv();

const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");

const pool = require("./db");

const productRoutes = require("./routes/productRoutes");
const saleRoutes = require("./routes/saleRoutes");
const debtRoutes = require("./routes/debtRoutes");
const customerRoutes = require("./routes/customerRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const dashboardWidgetRoutes = require("./routes/dashboardWidgetRoutes");
const businessInsightsRoutes = require("./routes/businessInsightsRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const purchaseReturnRoutes = require("./routes/purchaseReturnRoutes");
const reportRoutes = require("./routes/reportRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const businessRoutes = require("./routes/businessRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const returnRoutes = require("./routes/returnRoutes");
const cashRegisterRoutes = require("./routes/cashRegisterRoutes");
const supplierPaymentRoutes = require("./routes/supplierPaymentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const loyaltyRoutes = require("./routes/loyaltyRoutes");
const searchRoutes = require("./routes/searchRoutes");
const auditRoutes = require("./routes/auditRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const accountRoutes = require("./routes/accountRoutes");
const approvalRoutes = require("./routes/approvalRoutes");
const exportRoutes = require("./routes/exportRoutes");
const assistantRoutes = require("./routes/assistantRoutes");
const { apiWriteLimiter } = require("./middleware/rateLimit");
const { captureException } = require("./services/sentry");
const integrationRoutes = require("./routes/integrationRoutes");
const branchRoutes = require("./routes/branchRoutes");
const productionRoutes = require("./routes/productionRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

app.disable("x-powered-by");

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
});

app.use(express.json({ limit: "1mb", verify: (req, res, buf) => { if (req.originalUrl.includes("/api/whatsapp/webhook")) req.rawBody = Buffer.from(buf); } }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.use("/api", (req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        return apiWriteLimiter(req, res, next);
    }
    return next();
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/products", productRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/debts", debtRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/dashboard-widgets", dashboardWidgetRoutes);
app.use("/api/business-insights", businessInsightsRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/purchase-returns", purchaseReturnRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/cash-register", cashRegisterRoutes);
app.use("/api/supplier-payments", supplierPaymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/loyalty", loyaltyRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/assistant", assistantRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/branches", branchRoutes);

app.use("/api/production", productionRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/whatsapp", whatsappRoutes);

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");
        return res.json({ status: "ok", service: "DukaFlow API", database: "connected", environment: process.env.NODE_ENV || "development", timestamp: new Date().toISOString() });
    } catch (error) {
        return res.status(503).json({ status: "degraded", service: "DukaFlow API", database: "disconnected", environment: process.env.NODE_ENV || "development", timestamp: new Date().toISOString() });
    }
});

app.get("/api/health/db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS current_time");
        res.json({ status: "ok", database: "connected", time: result.rows[0].current_time });
    } catch (error) {
        console.error("DB HEALTH ERROR:", error.message);
        res.status(500).json({ status: "error", database: "disconnected" });
    }
});

const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath, {
    extensions: ["html"],
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0
}));

app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

app.use("/api", (req, res) => {
    res.status(404).json({ message: "API endpoint not found." });
});

app.use((error, req, res, next) => {
    console.error("UNHANDLED SERVER ERROR:", error);
    captureException(error, { path: req.path, method: req.method }).catch(() => {});
    if (res.headersSent) return next(error);
    return res.status(500).json({ message: "Internal server error." });
});

const server = app.listen(PORT, HOST, () => {
    console.log(`DukaFlow server running on http://localhost:${PORT}`);
});

server.on("error", (error) => {
    console.error("SERVER ERROR:", error);
});

module.exports = app;
