const axios = require("axios");
const { getPaypalAccessToken } = require("./paypal");

const baseUrl = process.env.PAYPAL_BASE_URL;
const returnUrl = process.env.PAYPAL_RETURN_URL;
const cancelUrl = process.env.PAYPAL_CANCEL_URL;

/**
 * Create PayPal Subscription
 * Flow:
 * 1) Get PayPal access token
 * 2) Call PayPal Subscriptions API with plan_id
 * 3) Return PayPal subscription id + approval link
 */
async function createPaypalSubscription({ paypalPlanId, customId }) {
  const token = await getPaypalAccessToken();

  if (!returnUrl || !cancelUrl) {
    throw new Error("Missing PayPal redirect URLs: PAYPAL_RETURN_URL, PAYPAL_CANCEL_URL");
  }
  const response = await axios.post(
    `${baseUrl}/v1/billing/subscriptions`,
    {
      plan_id: paypalPlanId,
      custom_id: customId, // optional: helps you map in logs
      application_context: {
        brand_name: "Subscription Node",
        locale: "en-US",
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: returnUrl, // not used if you rely on webhook
        cancel_url: cancelUrl
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  const paypalSubscriptionId = response.data.id;

  const approvalUrl =
    response.data.links?.find((l) => l.rel === "approve")?.href ||
    response.data.links?.find((l) => l.rel === "payer-action")?.href;

  return { paypalSubscriptionId, approvalUrl, raw: response.data };
}

module.exports = { createPaypalSubscription };
