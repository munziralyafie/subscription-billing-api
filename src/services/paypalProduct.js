const axios = require("axios");
const { getPaypalAccessToken } = require("./paypal");

const baseUrl = process.env.PAYPAL_BASE_URL;

// Create PayPal Product (run once)
async function createPaypalProduct({ name, description }) {
  const token = await getPaypalAccessToken();

  const response = await axios.post(
    // payPal returns the productId with prefix "PROD-..."
    `${baseUrl}/v1/catalogs/products`,
    {
      name,
      description,
      type: "service",
      category: "software",
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return response.data; // contains id
}

// Create PayPal Billing Plan (for each plan)
async function createPaypalPlan({ productId, name, price, currency, billingCycle }) {
  const token = await getPaypalAccessToken();

  const interval_unit = billingCycle === "monthly" ? "MONTH" : "YEAR";

  const response = await axios.post(
    // payPal returns the paypalPlanId with prefix "P-..."
    `${baseUrl}/v1/billing/plans`,
    {
      product_id: productId,
      name,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit, interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0, // 0 = infinite until cancelled
          pricing_scheme: {
            fixed_price: { value: String(price.toFixed(2)), currency_code: currency },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return response.data; // contains id (plan id)
}

module.exports = { createPaypalProduct, createPaypalPlan };