const axios = require("axios");

const paypal = {
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    baseUrl: process.env.PAYPAL_BASE_URL,
    webhook: process.env.PAYPAL_WEBHOOK_URL
}

// Simple in-memory cache so you don't request a new token on every API call
let cachedToken = null;
let cachedTokenExpiresAt = 0;

/**
 * ============================================================
 * GET PAYPAL ACCESS TOKEN SERVICE
 * ============================================================
 * Flow:
 * 1. Validate required PayPal env variables
 * 2. Reuse cached token if still valid (with 60s safety buffer)
 * 3. Request new access token from PayPal OAuth endpoint
 * 4. Cache token and exact expiry timestamp in memory
 * 5. Return access token to caller
 * 6. If request fails, clear cache and throw normalized error
 */
async function getPaypalAccessToken() {
    // 1. PayPal env variables validation
    if (!paypal.baseUrl || !paypal.clientId || !paypal.clientSecret) {
        throw new Error("Missing PayPal env vars: PAYPAL_BASE_URL, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET");
    }

    // 2. Reuse cached token if still valid
    const now = Date.now();
    if (cachedToken && cachedTokenExpiresAt > now + 60_000) {
        return cachedToken;
    }

    try {
        const response = await axios.post(
            // 3. Request new access token from PayPal
            `${paypal.baseUrl}/v1/oauth2/token`, 
            // PayPal expects x-www-form-urlencoded
            new URLSearchParams({ grant_type: "client_credentials" }).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                auth: {
                    username: paypal.clientId,
                    password: paypal.clientSecret
                },
                timeout: 15_000
            }
        );

        // 4. Cache token and exact expiry timestamp
        cachedToken = response.data.access_token;
        cachedTokenExpiresAt = Date.now() + (Number(response.data.expires_in) * 1000);

        // 5. Return access token
        return cachedToken;
    } catch (error){
        const status = error.response?.status;
        const data = error.response?.data;

        // 6. clear cache and throw normalized error
        cachedToken = null;
        cachedTokenExpiresAt = 0;

        throw new Error(
            `Failed to get PayPal access token${status ? ` (HTTP ${status})` : ""}: ${JSON.stringify(data)}`
        );
    }
}

module.exports = { getPaypalAccessToken };
