const express = require("express");
const router = express.Router();

const { auth, checkRole } = require("../middleware/auth");
const { createPaypalProduct } = require("../services/paypalProduct");

// ADMIN ONLY (RUN ONCE)
router.post("/product/init", auth, checkRole("admin"), async (req, res) => {
  try {
    const product = await createPaypalProduct({
      name: "Subscription Node",
      description: "Subscription plans for Subscription Node App",
    });

    // copy this id into .env as PAYPAL_PRODUCT_ID
    res.status(201).json({
      message: "PayPal product created. Copy productId into PAYPAL_PRODUCT_ID in your .env",
      productId: product.id,
      product,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
});

module.exports = router;