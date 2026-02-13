const axios = require("axios");
const { getPaypalAccessToken } = require("./paypal");

const baseUrl = process.env.PAYPAL_BASE_URL;

async function verifyPaypalWebhookSignature({ headers, body }) {
  const token = await getPaypalAccessToken();

  // PayPal headers (case-insensitive, express makes them lowercase)
  const transmissionId = headers["paypal-transmission-id"];
  const transmissionTime = headers["paypal-transmission-time"];
  const transmissionSig = headers["paypal-transmission-sig"];
  const certUrl = headers["paypal-cert-url"];
  const authAlgo = headers["paypal-auth-algo"];

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    throw new Error("Missing PayPal verification headers");
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId){
    throw new Error("Missing PAYPAL_WEBHOOK_ID in env");
  } 

  const response = await axios.post(
    `${baseUrl}/v1/notifications/verify-webhook-signature`,
    {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: body, // IMPORTANT: send the entire webhook payload
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  // resp.data.verification_status should be "SUCCESS"
  return { ok: response.data.verification_status === "SUCCESS", raw: response.data };
}

// Get subscription details (accurate periodStart/periodEnd)
async function getPaypalSubscriptionDetails(paypalSubscriptionId) {
  const token = await getPaypalAccessToken();

  const response = await axios.get(
    `${baseUrl}/v1/billing/subscriptions/${paypalSubscriptionId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    }
  );

  return response.data;
}

module.exports = { verifyPaypalWebhookSignature, getPaypalSubscriptionDetails };
