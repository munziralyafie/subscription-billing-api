const express = require("express");
const cookieParser = require("cookie-parser");

// ROUTES MODULES
const userRoutes = require("./routes/user");
const authRoutes = require("./routes/auth");
const planRoutes = require("./routes/plan");
const subscriptionRoutes = require("./routes/subscription");
const paypalCreateProductRoutes = require("./routes/paypalCreateProduct");
const paypalWebhookRoutes = require("./routes/paypalWebhook");

const app = express();

// MIDDLEWARE
app.use(express.json());
app.use(cookieParser());

// API ROUTES
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/plan", planRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/paypal", paypalCreateProductRoutes);
app.use("/webhooks", paypalWebhookRoutes);

module.exports = app;
